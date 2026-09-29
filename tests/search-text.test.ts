import {
  mkdir,
  mkdtemp,
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
  createSearchTextTool,
} from "../src/tools/search-text.js";


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


async function createWorkspace(): Promise<string> {
  tempDirectory = await mkdtemp(
    join(tmpdir(), "agent-harness-"),
  );

  return tempDirectory;
}


describe("search_text", () => {
  it("matches plain text literally and skips ignored dirs and binary files", async () => {
    const root = await createWorkspace();

    await mkdir(join(root, "src"));
    await mkdir(join(root, "node_modules"));

    await writeFile(
      join(root, "src", "a.ts"),
      "const fooXbar = 1;\nfoo.bar(baz);\n",
      "utf8",
    );

    await writeFile(
      join(root, "node_modules", "dep.js"),
      "foo.bar(baz);\n",
      "utf8",
    );

    await writeFile(
      join(root, "image.bin"),
      Buffer.concat([
        Buffer.from([0]),
        Buffer.from("foo.bar(baz);"),
      ]),
    );

    const tool = createSearchTextTool(root);

    // 按正则 "foo.bar(" 会报错；按正则 "foo.bar" 还会误中 fooXbar
    const result = await tool.execute("call-1", {
      pattern: "foo.bar(",
    });

    expect(result.details.matches).toEqual([
      {
        path: "src/a.ts",
        line: 2,
        text: "foo.bar(baz);",
      },
    ]);

    expect(result.content[0]).toEqual({
      type: "text",
      text: "src/a.ts:2: foo.bar(baz);",
    });
  });


  it("truncates results and tells the model", async () => {
    const root = await createWorkspace();

    await writeFile(
      join(root, "many.txt"),
      Array.from({ length: 150 }, () => "hit").join("\n"),
      "utf8",
    );

    const tool = createSearchTextTool(root);

    const result = await tool.execute("call-1", {
      pattern: "hit",
    });

    expect(result.details.matches).toHaveLength(100);
    expect(result.details.truncated).toBe(true);

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("results truncated");
  });
});