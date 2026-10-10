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

import {
  createSearchTextTool,
} from "../src/tools/search-text.js";

import {
  createWriteFileTool,
} from "../src/tools/write-file.js";


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

  it(
    "refuses to read .env but allows .env.example",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(tmpdir(), "agent-harness-"),
        );

      await writeFile(
        join(tempDirectory, ".env"),
        "AGENT_API_KEY=secret",
        "utf8",
      );

      await writeFile(
        join(tempDirectory, ".env.example"),
        "AGENT_API_KEY=",
        "utf8",
      );

      const tool =
        createReadFileTool(tempDirectory);

      await expect(
        tool.execute("call-1", { path: ".env" }),
      ).rejects.toThrow("may contain secrets");

      // 绕一圈也不行
      await expect(
        tool.execute("call-2", { path: "./sub/../.env" }),
      ).rejects.toThrow("may contain secrets");

      const example = await tool.execute("call-3", {
        path: ".env.example",
      });

      expect(example.content[0]?.text).toBe("AGENT_API_KEY=");
    },
  );
  it(
    "blocks .env however the name is spelled (case, Windows trailing dots/spaces and stream names)",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(tmpdir(), "agent-harness-"),
        );

      await writeFile(
        join(tempDirectory, ".env"),
        "AGENT_API_KEY=secret",
        "utf8",
      );

      const read = createReadFileTool(tempDirectory);
      const search = createSearchTextTool(tempDirectory);
      const write = createWriteFileTool(tempDirectory);

      // Windows、macOS 默认不区分大小写：.ENV 就是 .env
      const spellings = [
        ".ENV",
        ".Env.Local",
        ...(process.platform === "win32"
          ? [".env.", ".env ", ".env::$DATA", ".ENV:$DATA"]
          : []),
      ];

      for (const path of spellings) {
        await expect(
          read.execute("call-1", { path }),
        ).rejects.toThrow(/may contain secrets|alternate data stream/);

        await expect(
          search.execute("call-2", { pattern: "AGENT", path }),
        ).rejects.toThrow(/may contain secrets|alternate data stream/);

        await expect(
          write.execute("call-3", { path, content: "x" }),
        ).rejects.toThrow(/may contain secrets|alternate data stream/);
      }

      // .env.example 仍然可读，不论大小写
      await writeFile(
        join(tempDirectory, ".env.example"),
        "AGENT_API_KEY=",
        "utf8",
      );

      await expect(
        read.execute("call-4", { path: ".env.example" }),
      ).resolves.toBeDefined();
    },
  );

  it.runIf(process.platform === "win32")(
    "refuses NTFS alternate data streams, which git diff does not show",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(tmpdir(), "agent-harness-"),
        );

      await writeFile(join(tempDirectory, "notes.txt"), "hi", "utf8");

      const write = createWriteFileTool(tempDirectory);

      await expect(
        write.execute("call-1", { path: "notes.txt:hidden", content: "payload" }),
      ).rejects.toThrow("alternate data stream");
    },
  );
});
