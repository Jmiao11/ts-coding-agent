import {
  textOf,
} from "../context/token-estimate.js";

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

    const task = entries.find(
      (entry) => entry.type === "message" && entry.id === taskEntryId,
    );

    const taskText =
      task?.type === "message" && task.message.role === "user"
        ? textOf(task.message.content)
        : "";

    return { taskEntryId, taskText, files: changed };
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
