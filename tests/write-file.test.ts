import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
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

import {
  createEditFileTool,
} from "../src/tools/edit-file.js";

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
  it("refuses to write inside .git, however the path is spelled", async () => {
    const root = await createWorkspace();

    await mkdir(join(root, ".git", "hooks"), { recursive: true });
    await writeFile(join(root, ".git", "config"), "[core]\n", "utf8");

    const write = createWriteFileTool(root);
    const edit = createEditFileTool(root);

    const paths = [
      ".git/hooks/pre-commit",
      ".GIT/hooks/pre-commit",
      "sub/.git/hooks/pre-commit",
      ...(process.platform === "win32"
        ? [".git./hooks/pre-commit", ".git /hooks/pre-commit"]
        : []),
    ];

    for (const path of paths) {
      await expect(
        write.execute("call-1", { path, content: "echo pwned" }),
      ).rejects.toThrow("blocked");
    }

    await expect(
      edit.execute("call-2", {
        path: ".git/config",
        oldText: "[core]",
        newText: "[core]\n\thooksPath = evil",
      }),
    ).rejects.toThrow("blocked");

    await expect(
      stat(join(root, ".git", "hooks", "pre-commit")),
    ).rejects.toThrow();

    expect(
      await readFile(join(root, ".git", "config"), "utf8"),
    ).toBe("[core]\n");
  });

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
