import {
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
  createReadFileTool,
} from "../src/tools/read-file.js";


let tempDirectory:
  string | undefined;


afterEach(async () => {
  if (tempDirectory) {
    await rm(
      tempDirectory,
      {
        recursive: true,
        force: true,
      },
    );

    tempDirectory =
      undefined;
  }
});


describe("read_file", () => {
  it(
    "reads a UTF-8 file inside the workspace",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(
            tmpdir(),
            "agent-harness-",
          ),
        );


      await writeFile(
        join(
          tempDirectory,
          "hello.txt",
        ),
        "hello agent",
        "utf8",
      );


      const tool =
        createReadFileTool(
          tempDirectory,
        );


      const result =
        await tool.execute(
          "call-1",
          {
            path:
              "hello.txt",
          },
        );


      expect(
        result.content,
      ).toEqual([
        {
          type: "text",
          text: "hello agent",
        },
      ]);
    },
  );


  it(
    "rejects paths outside the workspace",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(
            tmpdir(),
            "agent-harness-",
          ),
        );


      const tool =
        createReadFileTool(
          tempDirectory,
        );


      await expect(
        tool.execute(
          "call-1",
          {
            path:
              "../secret.txt",
          },
        ),
      ).rejects.toThrow(
        "outside the workspace",
      );
    },
  );


  it(
    "returns the first 500 lines of a long file and continues from offset",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(
            tmpdir(),
            "agent-harness-",
          ),
        );

      await writeFile(
        join(tempDirectory, "long.txt"),
        Array.from(
          { length: 1200 },
          (_, index) => `line ${index + 1}`,
        ).join("\n"),
        "utf8",
      );

      const tool =
        createReadFileTool(tempDirectory);

      const first = await tool.execute("call-1", {
        path: "long.txt",
      });

      const firstText = first.content[0]?.text ?? "";

      expect(firstText.startsWith("line 1\n")).toBe(true);
      expect(firstText).toContain("line 500\n");
      expect(firstText).not.toContain("line 501");
      expect(firstText).toContain(
        "[showing lines 1-500 of 1200; use offset=501 to read more]",
      );

      const next = await tool.execute("call-2", {
        path: "long.txt",
        offset: 501,
        limit: 2,
      });

      expect(next.content[0]?.text).toBe(
        "line 501\nline 502\n\n[showing lines 501-502 of 1200; use offset=503 to read more]",
      );
    },
  );
});
