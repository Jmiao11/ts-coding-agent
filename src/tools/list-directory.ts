import {
  readdir,
} from "node:fs/promises";

import {
  relative,
  resolve,
} from "node:path";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";


const listDirectoryParameters =
  Type.Object(
    {
      path:
        Type.Optional(
          Type.String({
            minLength: 1,
          }),
        ),
    },
    {
      additionalProperties: false,
    },
  );


export type ListDirectoryDetails = {
  path: string;

  entries: Array<{
    name: string;
    type:
      | "file"
      | "directory"
      | "other";
  }>;
};


export function createListDirectoryTool(
  workspaceRoot: string,
): AgentTool<
  typeof listDirectoryParameters,
  ListDirectoryDetails
> {
  const root =
    resolve(workspaceRoot);


  return {
    name:
      "list_directory",

    label:
      "List Directory",

    description:
      "List files and directories inside the workspace. Use path '.' to list the workspace root.",

    parameters:
      listDirectoryParameters,


    async execute(
      _toolCallId,
      parameters,
    ) {
      const requestedPath =
        parameters.path ?? ".";


      const absolutePath =
        resolve(
          root,
          requestedPath,
        );


      const relativePath =
        relative(
          root,
          absolutePath,
        );


      /*
       * 禁止：
       *
       * ../
       * ../../
       *
       * 逃出 workspace。
       *
       * 但这里允许 "."，
       * 因为列 workspace 根目录是正常需求。
       */
      if (
        relativePath === ".."
        || relativePath.startsWith(
          `..${process.platform === "win32"
            ? "\\"
            : "/"
          }`,
        )
      ) {
        throw new Error(
          `Path is outside the workspace: ${requestedPath}`,
        );
      }


      const directoryEntries =
        await readdir(
          absolutePath,
          {
            withFileTypes: true,
          },
        );


      const entries =
        directoryEntries
          .map((entry) => ({
            name:
              entry.name,

            type:
              entry.isDirectory()
                ? "directory" as const
                : entry.isFile()
                  ? "file" as const
                  : "other" as const,
          }))
          .sort(
            (left, right) => {
              /*
               * directory 优先，
               * 然后按名字排序。
               */
              if (
                left.type
                !== right.type
              ) {
                if (
                  left.type
                  === "directory"
                ) {
                  return -1;
                }

                if (
                  right.type
                  === "directory"
                ) {
                  return 1;
                }
              }

              return left.name.localeCompare(
                right.name,
              );
            },
          );


      const text =
        entries
          .map((entry) => {
            const prefix =
              entry.type
              === "directory"
                ? "[DIR]"
                : entry.type
                  === "file"
                    ? "[FILE]"
                    : "[OTHER]";

            return `${prefix} ${entry.name}`;
          })
          .join("\n");


      return {
        content: [
          {
            type: "text",

            text:
              text.length > 0
                ? text
                : "(empty directory)",
          },
        ],

        details: {
          path:
            relativePath || ".",

          entries,
        },
      };
    },
  };
}