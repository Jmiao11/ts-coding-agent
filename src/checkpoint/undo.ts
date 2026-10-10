import {
  textOf,
} from "../context/token-estimate.js";

import type {
  UserMessage,
} from "../ai/types.js";

import type {
  SessionEntry,
} from "../session/session-store.js";

import {
  assertNotInsideGitDir,
  resolveWorkspacePath,
} from "../tools/workspace-path.js";

import {
  restoreSnapshot,
  sameSnapshot,
  snapshotFile,
  type FileSnapshot,
} from "./file-change.js";


/** 一个文件在一个任务里的净变化 */
export type UndoFile = {
  path: string;
  before: FileSnapshot;
  after: FileSnapshot;
};


export type UndoPlan = {
  taskEntryId: string;

  /** 发起任务的 user 消息，给用户确认用 */
  taskText: string;

  files: UndoFile[];
};


/** 发起任务的 user 消息原文 */
function taskTextOf(
  entries: SessionEntry[],
  taskEntryId: string,
): string {
  const task = entries.find(
    (entry) => entry.type === "message" && entry.id === taskEntryId,
  );

  return task?.type === "message" && task.message.role === "user"
    ? textOf(task.message.content)
    : "";
}


/**
 * 最近一个还没撤销、有净变化的任务。
 * 同一文件在一个任务里改了多次：取第一次的 before、最后一次的 after。
 */
export function planUndo(
  entries: SessionEntry[],
): UndoPlan | undefined {
  const undone = new Set(
    entries.flatMap((entry) =>
      entry.type === "undo" ? [entry.taskEntryId] : [],
    ),
  );

  // 任务按第一次出现文件变化的顺序排列，也就是任务发生的顺序
  const tasks = new Map<string, Map<string, UndoFile>>();

  for (const entry of entries) {
    if (entry.type !== "file_change" || undone.has(entry.taskEntryId)) {
      continue;
    }

    let files = tasks.get(entry.taskEntryId);

    if (!files) {
      files = new Map();
      tasks.set(entry.taskEntryId, files);
    }

    const earlier = files.get(entry.path);

    files.set(entry.path, {
      path: entry.path,
      before: earlier ? earlier.before : entry.before,
      after: entry.after,
    });
  }

  for (const [taskEntryId, files] of [...tasks].reverse()) {
    // 改了又改回原样的文件不算变化
    const changed = [...files.values()].filter(
      (file) => !sameSnapshot(file.before, file.after),
    );

    if (changed.length === 0) {
      continue;
    }

    return {
      taskEntryId,
      taskText: taskTextOf(entries, taskEntryId),
      files: changed,
    };
  }

  return undefined;
}


/** 不盲信会话里记的路径：重新校验 workspace 边界、符号链接和 .git */
function resolveForUndo(
  workspaceRoot: string,
  path: string,
): string {
  const { absolutePath, relativePath } =
    resolveWorkspacePath(workspaceRoot, path);

  assertNotInsideGitDir(workspaceRoot, absolutePath, relativePath);

  return absolutePath;
}


/** 当前内容和任务结束时不一样的文件：之后被手动改过、被命令改过，或者被删了 */
export async function findConflicts(
  workspaceRoot: string,
  plan: UndoPlan,
): Promise<string[]> {
  const conflicts: string[] = [];

  for (const file of plan.files) {
    const current = await snapshotFile(
      resolveForUndo(workspaceRoot, file.path),
    );

    if (!sameSnapshot(current, file.after)) {
      conflicts.push(file.path);
    }
  }

  return conflicts;
}


/**
 * 确认之后、恢复之前再查一次：用户看 [y/N] 的时候文件可能又被改了。
 * 只返回之前没有提示过的冲突；已经标过 ⚠ 的文件，用户已同意覆盖。
 */
export async function findNewConflicts(
  workspaceRoot: string,
  plan: UndoPlan,
  shown: ReadonlySet<string>,
): Promise<string[]> {
  return (await findConflicts(workspaceRoot, plan)).filter(
    (path) => !shown.has(path),
  );
}


/** 恢复到任务开始前；返回恢复失败的文件 */
export async function applyUndo(
  workspaceRoot: string,
  plan: UndoPlan,
): Promise<Array<{ path: string; error: unknown }>> {
  const failures: Array<{ path: string; error: unknown }> = [];

  for (const file of plan.files) {
    try {
      await restoreSnapshot(
        resolveForUndo(workspaceRoot, file.path),
        file.before,
      );
    } catch (error) {
      failures.push({ path: file.path, error });
    }
  }

  return failures;
}

export type AnnouncedUndo = {
  taskText: string;
  files: string[];
};


/**
 * 还没告诉过模型的撤销：最后一条消息之后的 undo 条目。
 * 说明一旦作为消息写进会话，这些撤销就不再位于「最后一条消息之后」。
 */
export function unannouncedUndos(
  entries: SessionEntry[],
): AnnouncedUndo[] {
  let lastMessage = -1;

  entries.forEach((entry, index) => {
    if (entry.type === "message") {
      lastMessage = index;
    }
  });

  return entries.slice(lastMessage + 1).flatMap((entry) =>
    entry.type === "undo"
      ? [{ taskText: taskTextOf(entries, entry.taskEntryId), files: entry.files }]
      : [],
  );
}


/** 发给模型的说明：对话里还留着那些修改，但文件已经恢复了 */
export function createUndoNote(
  undos: AnnouncedUndo[],
): UserMessage | undefined {
  if (undos.length === 0) {
    return undefined;
  }

  const lines = [
    "[Note from the harness, not written by the user] The user ran /undo. The file changes made by the task(s) below were reverted: each listed file is back to its content from before that task, and files the task had created were deleted.",
  ];

  for (const undo of undos) {
    const request = undo.taskText.replace(/\s+/g, " ").trim().slice(0, 200);

    lines.push(`- Task: ${request}`);

    for (const file of undo.files) {
      lines.push(`  - ${file}`);
    }
  }

  lines.push(
    "The conversation above still shows those edits. Do not assume they are present; read a file again before relying on its content.",
  );

  return {
    role: "user",
    content: lines.join("\n"),
    timestamp: Date.now(),
  };
}
