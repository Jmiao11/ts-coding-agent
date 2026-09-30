import {
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  join,
  resolve,
} from "node:path";
import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createWriteFileTool,
} from "../src/tools/write-file.js";

let root: string | undefined;

afterEach(async () => {
  if (root) {
    await rm(root, {
      recursive: true,
      force: true,
    });
    root = undefined;
  }
});

async function createWorkspace(): Promise<string> {
  root = await mkdtemp(
    join(tmpdir(), "agent-write-file-"),
  );
  return root;
}

describe("write_file", () => {
  it("creates a new file and missing parent directories", async () => {
    const root = await createWorkspace();
    const tool = createWriteFileTool(root);

    const result = await tool.execute("call-1", {
      path: "src/new/hello.ts",
      content: "hello",
    });

    expect(
      await readFile(join(root, "src", "new", "hello.ts"), "utf8"),
    ).toBe("hello");

    expect(result.details.created).toBe(true);
  });

  it("rejects paths outside the workspace", async () => {
    const root = await createWorkspace();
    const tool = createWriteFileTool(root);

    await expect(
      tool.execute("call-1", { path: "../outside.txt", content: "x" }),
    ).rejects.toThrow("outside the workspace");

    // 另一个盘符 / UNC 路径：旧的检查会放行它
    if (process.platform === "win32") {
      await expect(
        tool.execute("call-2", {
          path: "\\\\server\\share\\x.txt",
          content: "x",
        }),
      ).rejects.toThrow("outside the workspace");
    }

    await expect(
      stat(resolve(root, "..", "outside.txt")),
    ).rejects.toThrow();
  });
});
