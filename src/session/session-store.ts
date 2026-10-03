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


// S2 再加入 CompactionEntry。
export type SessionEntry = MessageEntry;


export type LoadedSession = {
  path: string;
  header: SessionHeader;
  entries: SessionEntry[];
};


// ---------- 位置 ----------

export function getSessionDir(
  cwd: string,
  root = DEFAULT_SESSIONS_ROOT,
): string {
  const safe = resolve(cwd)
    .replace(/^[/\\]/, "")
    .replace(/[/\\:]/g, "-");

  return join(root, `--${safe}--`);
}


/** 按文件修改时间取最近活动的 Session */
export function findMostRecentSession(
  dir: string,
): string | undefined {
  if (!existsSync(dir)) {
    return undefined;
  }

  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => join(dir, name))
    .map((path) => ({
      path,
      mtime: statSync(path).mtimeMs,
    }))
    .sort((left, right) => right.mtime - left.mtime)[0]
    ?.path;
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
    cwd: resolve(cwd),
  };

  const fileName =
    `${timestamp.replace(/[:.]/g, "-")}_${id}.jsonl`;

  return {
    path: join(getSessionDir(cwd, root), fileName),
    header,
  };
}


// ---------- 读 ----------

export function loadSession(
  path: string,
): LoadedSession {
  const text = readFileSync(path, "utf8");
  const parsed: unknown[] = [];

  for (const line of text.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }

    try {
      parsed.push(JSON.parse(line));
    } catch {
      // 跳过写到一半等无法解析的行。
    }
  }

  const [header, ...entries] =
    parsed as [SessionHeader | undefined, ...SessionEntry[]];

  // as 不会检查或转换实际数据。 它只是告诉编译器按这个类型理解；数据是否符合 Session 格式，仍需要代码验证

  if (!header || header.type !== "session") {
    throw new Error(`Not a session file: ${path}`);
  }

  // 隔开末尾的半行，避免下一次追加接在它后面。
  if (text.length > 0 && !text.endsWith("\n")) {
    appendFileSync(path, "\n");
  }

  return { path, header, entries };
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

  /** 追加一条消息，返回条目 ID */
  appendMessage(message: AgentMessage): string;
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
  }

  return {
    path: options.path,

    appendMessage(message) {
      const entry: MessageEntry = {
        type: "message",
        id: generateId(ids),
        parentId: lastId,
        timestamp: new Date().toISOString(),
        message,
      };

      write(entry);

      ids.add(entry.id);
      lastId = entry.id;

      return entry.id;
    },
  };
}