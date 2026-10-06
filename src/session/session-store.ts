import {
  randomUUID,
} from "node:crypto";

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  homedir,
} from "node:os";

import {
  dirname,
  join,
  resolve,
} from "node:path";

import type {
  AgentMessage,
} from "../agent/types.js";

import type {
  Usage,
} from "../ai/types.js";

import type {
  CompactionCheckpoint,
} from "../context/compaction.js";

import type {
  FileSnapshot,
} from "../checkpoint/file-change.js";


import {
  textOf,
} from "../context/token-estimate.js";


export const SESSION_VERSION = 1;

export const DEFAULT_SESSIONS_ROOT =
  join(homedir(), ".agent-harness", "sessions");


// ---------- 格式 ----------

/** 文件第一行：元信息，不属于条目树 */
export type SessionHeader = {
  type: "session";
  version: number;
  id: string;
  timestamp: string;
  cwd: string;
};


type EntryBase = {
  /** 通常为 8 位十六进制 */
  id: string;

  /** 第一条为 null；线性 Session 中指向上一条 */
  parentId: string | null;

  timestamp: string;
};


export type MessageEntry = EntryBase & {
  type: "message";
  message: AgentMessage;
};


/** 压缩记录；总结不作为普通 message 保存 */
export type CompactionEntry = EntryBase & {
  type: "compaction";

  summary: string;
  firstKeptEntryId: string;

  /** 原样保留的起始 user 消息；没有时为 null */
  turnStartEntryId: string | null;

  tokensBefore: number;

  details: {
    readFiles: string[];
    modifiedFiles: string[];
  };

  usage?: Usage;
};


/** 写工具造成的一次文件变化（检查点）；不属于 transcript */
export type FileChangeEntry = EntryBase & {
  type: "file_change";

  /** 发起这个任务的 user 消息条目 */
  taskEntryId: string;

  toolCallId: string;
  path: string;
  before: FileSnapshot;
  after: FileSnapshot;
};


/** 撤销记录：这个任务的文件变化已经恢复 */
export type UndoEntry = EntryBase & {
  type: "undo";
  taskEntryId: string;
  files: string[];
};


export type SessionEntry =
  | MessageEntry
  | CompactionEntry
  | FileChangeEntry
  | UndoEntry;


export type LoadedSession = {
  path: string;
  header: SessionHeader;
  entries: SessionEntry[];
};


// ---------- 位置 ----------

/** Windows 盘符统一成大写：f:\repo 和 F:\repo 是同一个目录。 */
function normalizeCwd(
  cwd: string,
): string {
  const resolved = resolve(cwd);

  return process.platform === "win32"
    ? resolved.replace(/^[a-z]:/, (drive) => drive.toUpperCase())
    : resolved;
}

export function getSessionDir(
  cwd: string,
  root = DEFAULT_SESSIONS_ROOT,
): string {
  const safe = normalizeCwd(cwd)
    .replace(/^[/\\]/, "")
    .replace(/[/\\:]/g, "-");

  return join(root, `--${safe}--`);
}


export type SessionSummary = {
  path: string;
  id: string;

  /** 最后活动时间（文件 mtime，和 -c 的选择依据一致） */
  modified: Date;

  messageCount: number;
  firstUserText: string;
  lastUserText: string;
  compacted: boolean;
};


/**
 * 列出目录里的会话，最近活动的在前。
 * 只读：列表不能修改文件（loadSession 补换行会改变 mtime，进而改变排序）。
 * Session 多了以后可以改成只读 header + 流式读取（Pi 的做法）。
 */
export function listSessions(
  dir: string,
): SessionSummary[] {
  if (!existsSync(dir)) {
    return [];
  }

  const summaries: SessionSummary[] = [];

  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) {
      continue;
    }

    const path = join(dir, name);

    try {
      const modified = statSync(path).mtime;

      const { header, entries } =
        parseSessionText(path, readFileSync(path, "utf8"));

      const userTexts = entries.flatMap((entry) =>
        entry.type === "message" && entry.message.role === "user"
          ? [textOf(entry.message.content)]
          : [],
      );

      summaries.push({
        path,
        id: header.id,
        modified,
        messageCount:
          entries.filter((entry) => entry.type === "message").length,
        firstUserText: userTexts[0] ?? "",
        lastUserText: userTexts.at(-1) ?? "",
        compacted:
          entries.some((entry) => entry.type === "compaction"),
      });
    } catch {
      // 损坏的文件或不是 Session 的文件：不列出，也不影响其他会话
    }
  }

  return summaries.sort(
    (left, right) =>
      right.modified.getTime() - left.modified.getTime(),
  );
}


/** 最近活动的会话（-c 用） */
export function findMostRecentSession(
  dir: string,
): string | undefined {
  return listSessions(dir)[0]?.path;
}


export function newSessionFile(
  cwd: string,
  root?: string,
): { path: string; header: SessionHeader } {
  const id = randomUUID();
  const timestamp = new Date().toISOString();

  const header: SessionHeader = {
    type: "session",
    version: SESSION_VERSION,
    id,
    timestamp,
    cwd: normalizeCwd(cwd),
  };

  const fileName =
    `${timestamp.replace(/[:.]/g, "-")}_${id}.jsonl`;

  return {
    path: join(getSessionDir(cwd, root), fileName),
    header,
  };
}


// ---------- 读 ----------

/** 解析 Session 文件内容（不修改文件）；不是 Session 文件就抛错 */
function parseSessionText(
  path: string,
  text: string,
): { header: SessionHeader; entries: SessionEntry[] } {
  const parsed: unknown[] = [];

  for (const line of text.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }

    try {
      parsed.push(JSON.parse(line));
    } catch {
      // 写到一半的行（进程被强制结束）：跳过
    }
  }

  const [header, ...entries] =
    parsed as [SessionHeader | undefined, ...SessionEntry[]];

  if (!header || header.type !== "session") {
    throw new Error(`Not a session file: ${path}`);
  }

  return { header, entries };
}


export function loadSession(
  path: string,
): LoadedSession {
  const text = readFileSync(path, "utf8");
  const { header, entries } = parseSessionText(path, text);

  // 最后一行没写完：补一个换行。
  // 否则下一条会接在半行后面，两行一起坏。
  if (text.length > 0 && !text.endsWith("\n")) {
    appendFileSync(path, "\n");
  }

  return { path, header, entries };
}


// ---------- 重建 ----------

export type RebuiltSession = {
  /** 完整 transcript */
  messages: AgentMessage[];

  /** messageIds[i] 对应 messages[i] */
  messageIds: string[];

  checkpoint?: CompactionCheckpoint;
};


/** 当前只处理线性 Session，按文件顺序重建 */
export function rebuildSession(
  entries: SessionEntry[],
): RebuiltSession {
  const messages: AgentMessage[] = [];
  const messageIds: string[] = [];

  let latest: CompactionEntry | undefined;
  let trustUsageFrom = 0;

  for (const entry of entries) {
    if (entry.type === "message") {
      messages.push(entry.message);
      messageIds.push(entry.id);
    } else if (entry.type === "compaction") {
      latest = entry;
      trustUsageFrom = messages.length;
    }
  }

  if (!latest) {
    return { messages, messageIds };
  }

  const firstKeptIndex =
    messageIds.indexOf(latest.firstKeptEntryId);

  const turnStartIndex =
    latest.turnStartEntryId === null
      ? -1
      : messageIds.indexOf(latest.turnStartEntryId);

  if (
    firstKeptIndex < 0
    || (latest.turnStartEntryId !== null && turnStartIndex < 0)
  ) {
    throw new Error(
      `Compaction entry ${latest.id} points to a missing message.`,
    );
  }

  return {
    messages,
    messageIds,
    checkpoint: {
      modelSummary: latest.summary,
      firstKeptIndex,
      turnStartIndex,
      trustUsageFrom,
      readFiles: latest.details.readFiles,
      modifiedFiles: latest.details.modifiedFiles,
    },
  };
}


// ---------- 写 ----------

function generateId(
  existing: Set<string>,
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = randomUUID().slice(0, 8);

    if (!existing.has(id)) {
      return id;
    }
  }

  return randomUUID();
}


export type SessionWriter = {
  readonly path: string;

  /** Session header 中的会话 UUID */
  readonly id: string;

  /** 追加一条消息，返回条目 ID */
  appendMessage(message: AgentMessage): string;

  appendCompaction(
    checkpoint: CompactionCheckpoint,
    extra: { tokensBefore: number; usage?: Usage },
  ): string;

  /** 追加一次文件变化（检查点），返回条目 ID */
  appendFileChange(change: {
    taskEntryId: string;
    toolCallId: string;
    path: string;
    before: FileSnapshot;
    after: FileSnapshot;
  }): string;

  /** 追加一条撤销记录，返回条目 ID */
  appendUndo(undo: { taskEntryId: string; files: string[] }): string;
};


export function createSessionWriter(
  options: {
    path: string;
    header: SessionHeader;
    entries?: SessionEntry[];
  },
): SessionWriter {
  const ids = new Set(
    options.entries?.map((entry) => entry.id),
  );

  const messageIds = (options.entries ?? [])
    .filter(
      (entry): entry is MessageEntry =>
        entry.type === "message",
    )
    .map((entry) => entry.id);

  let lastId = options.entries?.at(-1)?.id ?? null;
  let created = existsSync(options.path);

  function write(entry: SessionEntry): void {
    if (!created) {
      mkdirSync(dirname(options.path), {
        recursive: true,
      });

      writeFileSync(
        options.path,
        `${JSON.stringify(options.header)}\n`,
        { flag: "wx" },
      );

      created = true;
    }

    appendFileSync(
      options.path,
      `${JSON.stringify(entry)}\n`,
    );

    ids.add(entry.id);
    lastId = entry.id;
  }

  return {
    path: options.path,
    id: options.header.id,

    appendMessage(message) {
      const entry: MessageEntry = {
        type: "message",
        id: generateId(ids),
        parentId: lastId,
        timestamp: new Date().toISOString(),
        message,
      };

      write(entry);
      messageIds.push(entry.id);

      return entry.id;
    },

    appendCompaction(checkpoint, extra) {
      if (checkpoint.trustUsageFrom !== messageIds.length) {
        throw new Error(
          `Session out of sync: ${messageIds.length} messages written, compaction saw ${checkpoint.trustUsageFrom}.`,
        );
      }

      const firstKeptEntryId =
        messageIds[checkpoint.firstKeptIndex];

      const turnStartEntryId =
        checkpoint.turnStartIndex >= 0
          ? messageIds[checkpoint.turnStartIndex]
          : null;

      if (
        firstKeptEntryId === undefined
        || turnStartEntryId === undefined
      ) {
        throw new Error(
          "Compaction checkpoint points outside the session.",
        );
      }

      const entry: CompactionEntry = {
        type: "compaction",
        id: generateId(ids),
        parentId: lastId,
        timestamp: new Date().toISOString(),
        summary: checkpoint.modelSummary,
        firstKeptEntryId,
        turnStartEntryId,
        tokensBefore: extra.tokensBefore,
        details: {
          readFiles: checkpoint.readFiles,
          modifiedFiles: checkpoint.modifiedFiles,
        },
        ...(extra.usage ? { usage: extra.usage } : {}),
      };

      write(entry);

      return entry.id;
    },

    appendFileChange(change) {
      const entry: FileChangeEntry = {
        type: "file_change",
        id: generateId(ids),
        parentId: lastId,
        timestamp: new Date().toISOString(),
        ...change,
      };

      write(entry);

      return entry.id;
    },

    appendUndo(undo) {
      const entry: UndoEntry = {
        type: "undo",
        id: generateId(ids),
        parentId: lastId,
        timestamp: new Date().toISOString(),
        ...undo,
      };

      write(entry);

      return entry.id;
    },
  };
}
