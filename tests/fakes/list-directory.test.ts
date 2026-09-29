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
  createListDirectoryTool,
} from "../../src/tools/list-directory.js";


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


describe("list_directory", () => {
  it(
    "lists files and directories inside the workspace",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(
            tmpdir(),
            "agent-harness-",
          ),
        );


      await mkdir(
        join(
          tempDirectory,
          "src",
        ),
      );


      await writeFile(
        join(
          tempDirectory,
          "package.json",
        ),
        "{}",
        "utf8",
      );


      const tool =
        createListDirectoryTool(
          tempDirectory,
        );


      const result =
        await tool.execute(
          "call-1",
          {
            path: ".",
          },
        );


      expect(
        result.details.entries,
      ).toEqual([
        {
          name: "src",
          type: "directory",
        },
        {
          name: "package.json",
          type: "file",
        },
      ]);


      expect(
        result.content[0],
      ).toEqual({
        type: "text",
        text:
          "[DIR] src\n[FILE] package.json",
      });
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
        createListDirectoryTool(
          tempDirectory,
        );


      await expect(
        tool.execute(
          "call-1",
          {
            path: "../",
          },
        ),
      ).rejects.toThrow(
        "outside the workspace",
      );
    },
  );
});