import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  tmpdir,
} from "node:os";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createEditFileTool,
  MAX_SNIPPET_CHARS,
} from "../src/tools/edit-file.js";


let tempDirectory:
  string | undefined;


afterEach(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, {
      recursive: true,
      force: true,
    });

    tempDirectory = undefined;
  }
});


async function createWorkspaceWithFile(
  content: string,
): Promise<{ root: string; file: string }> {
  tempDirectory = await mkdtemp(
    join(tmpdir(), "agent-harness-"),
  );

  const file = join(tempDirectory, "a.ts");
  await writeFile(file, content, "utf8");

  return { root: tempDirectory, file };
}


describe("edit_file", () => {
  it("replaces the unique occurrence literally and keeps the rest", async () => {
    const { root, file } = await createWorkspaceWithFile(
      "const a = 1;\nconst b = 2;\n",
    );

    const tool = createEditFileTool(root);

    const result = await tool.execute("call-1", {
      path: "a.ts",
      oldText: "const b = 2;",
      // String.replace 会把 $1 当成替换模式
      newText: 'const b = "$1";',
    });

    expect(await readFile(file, "utf8")).toBe(
      'const a = 1;\nconst b = "$1";\n',
    );

    expect(result.details.line).toBe(2);
  });


  it("rejects missing or ambiguous oldText and leaves the file untouched", async () => {
    const original = "x = 1;\nx = 1;\n";
    const { root, file } = await createWorkspaceWithFile(original);

    const tool = createEditFileTool(root);

    await expect(
      tool.execute("call-1", {
        path: "a.ts",
        oldText: "x = 1;",
        newText: "x = 2;",
      }),
    ).rejects.toThrow("more than once");

    await expect(
      tool.execute("call-2", {
        path: "a.ts",
        oldText: "y = 1;",
        newText: "y = 2;",
      }),
    ).rejects.toThrow("not found");

    expect(await readFile(file, "utf8")).toBe(original);
  });


  it("matches LF oldText in a CRLF file and preserves CRLF", async () => {
    const { root, file } = await createWorkspaceWithFile(
      "line1\r\nline2\r\nline3\r\n",
    );

    const tool = createEditFileTool(root);

    await tool.execute("call-1", {
      path: "a.ts",
      oldText: "line1\nline2",
      newText: "line1\nchanged",
    });

    expect(await readFile(file, "utf8")).toBe(
      "line1\r\nchanged\r\nline3\r\n",
    );
  });

  it("edits a mixed-line-ending file without touching other lines", async () => {
    const { root, file } = await createWorkspaceWithFile(
      "a\r\nb\r\nc\nd\n",
    );

    const tool = createEditFileTool(root);

    // LF 区域：多行 oldText
    await tool.execute("call-1", {
      path: "a.ts",
      oldText: "c\nd",
      newText: "c\nX\nd",
    });

    // CRLF 区域：单行 oldText，插入的多行内容要跟随 CRLF
    await tool.execute("call-2", {
      path: "a.ts",
      oldText: "a",
      newText: "a\nA",
    });

    expect(await readFile(file, "utf8")).toBe(
      "a\r\nA\r\nb\r\nc\nX\nd\n",
    );
  });


  it("reports the edited region with three lines of context and no line-number prefixes", async () => {
    const { root } = await createWorkspaceWithFile(
      [
        "l1",
        "l2",
        "l3",
        "l4",
        "l5",
        "l6",
        "l7",
        "l8",
        "l9",
        "l10",
        "",
      ].join("\n"),
    );

    const tool = createEditFileTool(root);

    const result = await tool.execute("call-1", {
      path: "a.ts",
      oldText: "l5",
      newText: "L5",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text:
        "Edited a.ts at line 5.\n\n"
        + "[lines 2-8 of 10]\n"
        + [
          "l2",
          "l3",
          "l4",
          "L5",
          "l6",
          "l7",
          "l8",
        ].join("\n"),
    });
  });


  it("splits the snippet on CRLF without leaking carriage returns", async () => {
    const { root } = await createWorkspaceWithFile(
      "l1\r\nl2\r\nl3\r\nl4\r\nl5\r\n",
    );

    const tool = createEditFileTool(root);

    const result = await tool.execute("call-1", {
      path: "a.ts",
      oldText: "l3",
      newText: "L3",
    });

    expect(result.content[0]).toEqual({
      type: "text",
      text:
        "Edited a.ts at line 3.\n\n"
        + "[lines 1-5 of 5]\n"
        + [
          "l1",
          "l2",
          "L3",
          "l4",
          "l5",
        ].join("\n"),
    });

    expect(result.content[0]?.text).not.toContain("\r");
  });


  it("includes every line of a multi-line replacement plus context", async () => {
    const { root } = await createWorkspaceWithFile(
      [
        "m1",
        "m2",
        "m3",
        "m4",
        "m5",
        "m6",
        "m7",
        "m8",
        "m9",
        "m10",
        "m11",
        "m12",
        "",
      ].join("\n"),
    );

    const tool = createEditFileTool(root);

    const result = await tool.execute("call-1", {
      path: "a.ts",
      oldText: "m4\nm5",
      newText: "M4\nM5\nM6",
    });

    expect(result.content[0]).toEqual({
      type: "text",
      text:
        "Edited a.ts at line 4.\n\n"
        + "[lines 1-9 of 13]\n"
        + [
          "m1",
          "m2",
          "m3",
          "M4",
          "M5",
          "M6",
          "m6",
          "m7",
          "m8",
        ].join("\n"),
    });
  });


  it("truncates an overlong snippet and says so", async () => {
    const { root } = await createWorkspaceWithFile(
      "a\nb\nc\n",
    );

    const tool = createEditFileTool(root);

    const result = await tool.execute("call-1", {
      path: "a.ts",
      oldText: "b",
      newText: "x".repeat(MAX_SNIPPET_CHARS + 500),
    });

    const expectedSnippet = (
      "a\n"
      + "x".repeat(MAX_SNIPPET_CHARS + 500)
      + "\nc"
    ).slice(0, MAX_SNIPPET_CHARS);

    expect(expectedSnippet).toHaveLength(MAX_SNIPPET_CHARS);

    expect(result.content[0]).toEqual({
      type: "text",
      text:
        "Edited a.ts at line 2.\n\n"
        + "[lines 1-3 of 3]\n"
        + expectedSnippet
        + `\n… [snippet truncated to ${MAX_SNIPPET_CHARS} characters]`,
    });
  });
});
