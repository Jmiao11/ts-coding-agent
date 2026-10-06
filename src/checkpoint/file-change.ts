import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  dirname,
} from "node:path";


/** 文件在某一刻的内容；null 表示文件不存在 */
export type FileSnapshot =
  | { encoding: "utf8"; content: string }
  | { encoding: "base64"; content: string }
  | null;


/** 一次写工具调用造成的文件变化 */
export type FileChange = {
  /** 相对 workspace，用 / 分隔 */
  path: string;

  toolCallId: string;
  before: FileSnapshot;
  after: FileSnapshot;
};


export async function snapshotFile(
  absolutePath: string,
): Promise<FileSnapshot> {
  let buffer: Buffer;

  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }

  const text = buffer.toString("utf8");

  // 能按 UTF-8 原样还原就存文本，会话文件里看得懂；否则存 base64
  return Buffer.from(text, "utf8").equals(buffer)
    ? { encoding: "utf8", content: text }
    : { encoding: "base64", content: buffer.toString("base64") };
}


export function sameSnapshot(
  left: FileSnapshot,
  right: FileSnapshot,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.encoding === right.encoding
    && left.content === right.content;
}


/**
 * 包住一次写操作：之前、之后各读一次文件，内容变了就交给 record。
 * - 写操作抛错也会检查：它可能已经写了一部分。
 * - 记录本身出错不影响写操作的结果（否则写成功了却报错，模型会重试），交给 onRecordError。
 */
export async function captureFileChange<T>(
  input: {
    absolutePath: string;
    path: string;
    toolCallId: string;
    write: () => Promise<T>;
    record: (change: FileChange) => void;
    onRecordError?: (error: unknown) => void;
  },
): Promise<T> {
  const before = await snapshotFile(input.absolutePath);

  try {
    return await input.write();
  } finally {
    try {
      const after = await snapshotFile(input.absolutePath);

      if (!sameSnapshot(before, after)) {
        input.record({
          path: input.path,
          toolCallId: input.toolCallId,
          before,
          after,
        });
      }
    } catch (error) {
      input.onRecordError?.(error);
    }
  }
}

/** 把文件写回某个快照；null 表示删除（这是任务里新建的文件） */
export async function restoreSnapshot(
  absolutePath: string,
  snapshot: FileSnapshot,
): Promise<void> {
  if (snapshot === null) {
    await rm(absolutePath, { force: true });
    return;
  }

  // 父目录可能在任务之后被删了
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    Buffer.from(snapshot.content, snapshot.encoding),
  );
}
