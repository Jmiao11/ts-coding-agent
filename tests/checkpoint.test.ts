import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  captureFileChange,
  type FileChange,
} from "../src/checkpoint/file-change.js";

import {
  createEditFileTool,
} from "../src/tools/edit-file.js";

import {
  createWriteFileTool,
} from "../src/tools/write-file.js";

import type {
  WriteTarget,
  WriteTracker,
} from "../src/tools/write-tracker.js";


let root: string | undefined;


afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});


async function createWorkspace(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "agent-checkpoint-"));
  return root;
}


describe("captureFileChange", () => {
  it("records before and after for changed and new files, and nothing when content is unchanged", async () => {
    const dir = await createWorkspace();
    const existing = join(dir, "a.txt");
    const created = join(dir, "b.txt");

    await writeFile(existing, "old", "utf8");

    const changes: FileChange[] = [];
    const record = (change: FileChange): void => {
      changes.push(change);
    };

    await captureFileChange({
      absolutePath: existing,
      path: "a.txt",
      toolCallId: "call-1",
      record,
      write: () => writeFile(existing, "new", "utf8"),
    });

    await captureFileChange({
      absolutePath: created,
      path: "b.txt",
      toolCallId: "call-2",
      record,
      write: () => writeFile(created, "fresh", "utf8"),
    });

    // 内容没变：不记录
    await captureFileChange({
      absolutePath: existing,
      path: "a.txt",
      toolCallId: "call-3",
      record,
      write: () => writeFile(existing, "new", "utf8"),
    });

    expect(changes).toEqual([
      {
        path: "a.txt",
        toolCallId: "call-1",
        before: { encoding: "utf8", content: "old" },
        after: { encoding: "utf8", content: "new" },
      },
      {
        path: "b.txt",
        toolCallId: "call-2",
        before: null,
        after: { encoding: "utf8", content: "fresh" },
      },
    ]);
  });


  it("still records a change when the write throws after touching the file", async () => {
    const dir = await createWorkspace();
    const file = join(dir, "a.txt");

    await writeFile(file, "original", "utf8");

    const changes: FileChange[] = [];

    await expect(
      captureFileChange({
        absolutePath: file,
        path: "a.txt",
        toolCallId: "call-1",
        record: (change) => {
          changes.push(change);
        },
        write: async () => {
          await writeFile(file, "changed", "utf8");
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    expect(changes).toEqual([
      {
        path: "a.txt",
        toolCallId: "call-1",
        before: { encoding: "utf8", content: "original" },
        after: { encoding: "utf8", content: "changed" },
      },
    ]);
  });
});


describe("write tools and the tracker", () => {
  it("reach the tracker only after the safety checks pass", async () => {
    const dir = await createWorkspace();

    await writeFile(join(dir, ".env"), "AGENT_API_KEY=secret", "utf8");
    await writeFile(join(dir, "a.txt"), "x = 1;\n", "utf8");

    const seen: string[] = [];

    const track: WriteTracker = <T>(
      target: WriteTarget,
      write: () => Promise<T>,
    ): Promise<T> => {
      seen.push(target.relativePath);
      return write();
    };

    const write = createWriteFileTool(dir, { track });
    const edit = createEditFileTool(dir, { track });

    // 被拒绝的路径：track 不能被调用（否则快照会先读到不该读的文件）
    await expect(write.execute("call-1", { path: ".env", content: "x" })).rejects.toThrow();
    await expect(write.execute("call-2", { path: ".git/hooks/pre-commit", content: "x" })).rejects.toThrow();
    await expect(write.execute("call-3", { path: "../outside.txt", content: "x" })).rejects.toThrow();
    await expect(edit.execute("call-4", { path: ".env", oldText: "secret", newText: "y" })).rejects.toThrow();

    await write.execute("call-5", { path: "new.txt", content: "hello" });
    await edit.execute("call-6", { path: "a.txt", oldText: "x = 1;", newText: "x = 2;" });

    expect(seen).toEqual(["new.txt", "a.txt"]);
  });
});
