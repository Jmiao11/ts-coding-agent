import {
  readFile,
} from "node:fs/promises";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";

import {
  assertNotSecretFile,
  resolveWorkspacePath,
} from "./workspace-path.js";


const DEFAULT_LINE_LIMIT = 500;
const MAX_LINE_LIMIT = 2000;
export const MAX_OUTPUT_CHARS = 30_000;


const readFileParameters =
  Type.Object(
    {
      path: Type.String({
        minLength: 1,
        description:
          "File path relative to the workspace root.",
      }),

      offset: Type.Optional(
        Type.Integer({
          minimum: 1,
          description:
            "Line number to start reading from (1-based). Default 1.",
        }),
      ),

      limit: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: MAX_LINE_LIMIT,
          description:
            `Maximum number of lines to return. Default ${DEFAULT_LINE_LIMIT}.`,
        }),
      ),
    },
    {
      additionalProperties: false,
    },
  );


//content
// → 给 LLM
//
// details
// → 给 Runtime / Trace / Extension
export type ReadFileDetails = {
  path: string;
  bytes: number;
  totalLines: number;
  startLine: number;
  endLine: number;
};


export function createReadFileTool(
  workspaceRoot: string,
): AgentTool<
  typeof readFileParameters,
  ReadFileDetails
> {
  return {
    name: "read_file",

    label: "Read File",

    description:
      `Read a UTF-8 text file inside the workspace. The path must be relative to the workspace root. Returns at most ${DEFAULT_LINE_LIMIT} lines per call by default; use offset and limit to read other parts of large files.`,

    parameters:
      readFileParameters,


    async execute(
      _toolCallId,
      parameters,
    ) {
      const {
        absolutePath,
        relativePath,
      } = resolveWorkspacePath(
        workspaceRoot,
        parameters.path,
      );

      if (relativePath === ".") {
        throw new Error(
          `Path is not a file: ${parameters.path}`,
        );
      }

      assertNotSecretFile(relativePath, absolutePath);

      const buffer =
        await readFile(absolutePath);

      if (buffer.includes(0)) {
        throw new Error(
          `Binary file cannot be read as text: ${relativePath}`,
        );
      }

      const text =
        buffer.toString("utf8");

      /*
       * 按 "\n" 切：CRLF 文件每行末尾保留 "\r"，
       * join("\n") 后能还原原文。
       * 末尾换行不算一行。
       */
      const lines = text.split("\n");

      if (lines.at(-1) === "") {
        lines.pop();
      }

      const start =
        (parameters.offset ?? 1) - 1;

      if (start > 0 && start >= lines.length) {
        throw new Error(
          `offset ${start + 1} is beyond the end of ${relativePath} (${lines.length} lines).`,
        );
      }

      const limit =
        parameters.limit ?? DEFAULT_LINE_LIMIT;

      // 行数和字符数，先到哪个上限就停在哪
      const selected: string[] = [];
      let chars = 0;

      for (const line of lines.slice(start, start + limit)) {
        if (
          selected.length > 0
          && chars + line.length + 1 > MAX_OUTPUT_CHARS
        ) {
          break;
        }

        selected.push(line);
        chars += line.length + 1;
      }

      const end =
        start + selected.length;

      const partial =
        start > 0 || end < lines.length;

      let body = selected.join("\n");
      let output: string;

      // 整个文件且不超长：原样返回。
      // 只有一行的文件（压缩后的代码、大 JSON）也会走到这里，所以必须同时看长度。
      if (!partial && body.length <= MAX_OUTPUT_CHARS) {
        output = text;
      } else {
        // 只有第一行能单独超过上限（后面的行超了会停在上一行），所以被截断的是第 start + 1 行
        const cut =
          body.length > MAX_OUTPUT_CHARS
            ? `; line ${start + 1} was cut to ${MAX_OUTPUT_CHARS} of ${body.length} characters`
            : "";

        if (cut) {
          body = `${body.slice(0, MAX_OUTPUT_CHARS)}…`;
        }

        const more =
          end < lines.length
            ? `; use offset=${end + 1} to read more`
            : "";

        output =
          `${body}\n\n[showing lines ${start + 1}-${end} of ${lines.length}${cut}${more}]`;
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],

        details: {
          path: relativePath,
          bytes: buffer.length,
          totalLines: lines.length,
          startLine: start + 1,
          endLine: end,
        },
      };
    },
  };
}
