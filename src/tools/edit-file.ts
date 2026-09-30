import {
  readFile,
  writeFile,
} from "node:fs/promises";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";

import {
  assertNotSecretFile,
  resolveWorkspacePath,
} from "./workspace-path.js";


const editFileParameters =
  Type.Object(
    {
      path: Type.String({
        minLength: 1,
        description:
          "File path relative to the workspace root.",
      }),

      oldText: Type.String({
        minLength: 1,
        description:
          "Exact text to replace. Must match the file exactly, including whitespace and indentation, and must appear exactly once.",
      }),

      newText: Type.String({
        description:
          "Text that replaces oldText.",
      }),
    },
    {
      additionalProperties: false,
    },
  );


export type EditFileDetails = {
  path: string;

  /** 替换发生的起始行号（从 1 开始） */
  line: number;
};


function toLf(
  text: string,
): string {
  return text.replace(/\r\n/g, "\n");
}


function findAll(
  haystack: string,
  needle: string,
): number[] {
  const indexes: number[] = [];

  let index = haystack.indexOf(needle);

  while (index !== -1) {
    indexes.push(index);
    index = haystack.indexOf(needle, index + 1);
  }

  return indexes;
}


/**
 * 匹配位置所在行用的换行符。
 * 混合换行的文件里不同区域可能不同，所以按位置判断，不按整个文件。
 */
function lineEndingAt(
  content: string,
  index: number,
): "\n" | "\r\n" {
  const next = content.indexOf("\n", index);

  if (next !== -1) {
    return content[next - 1] === "\r" ? "\r\n" : "\n";
  }

  const previous = content.lastIndexOf("\n", index);

  if (previous !== -1) {
    return content[previous - 1] === "\r" ? "\r\n" : "\n";
  }

  return "\n";
}


export function createEditFileTool(
  workspaceRoot: string,
): AgentTool<
  typeof editFileParameters,
  EditFileDetails
> {
  return {
    name: "edit_file",

    label: "Edit File",

    description:
      "Replace one exact occurrence of oldText with newText in an existing UTF-8 file inside the workspace. Read the file first and copy oldText exactly. Include enough surrounding lines to make oldText unique. Prefer this over write_file when changing existing files.",

    parameters:
      editFileParameters,


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

      assertNotSecretFile(relativePath);

      const content =
        await readFile(absolutePath, "utf8");

      const oldLf = toLf(parameters.oldText);
      const newLf = toLf(parameters.newText);

      if (oldLf === newLf) {
        throw new Error(
          "oldText and newText are identical; nothing to change.",
        );
      }

      /*
       * 文件可能是 LF、CRLF 或混合：
       * oldText 的两种写法都试，在原始内容上匹配，
       * 只替换匹配到的那一段，其余字节原样保留。
       */
      const variants = [
        ...new Set([
          oldLf,
          oldLf.replace(/\n/g, "\r\n"),
        ]),
      ];

      const matches = variants.flatMap(
        (variant) =>
          findAll(content, variant).map(
            (index) => ({
              index,
              text: variant,
            }),
          ),
      );

      const [match, ...others] = matches;

      if (!match) {
        throw new Error(
          `oldText not found in ${relativePath}. Read the file again and copy the exact text, including whitespace and indentation.`,
        );
      }

      if (others.length > 0) {
        throw new Error(
          `oldText appears more than once in ${relativePath}. Include more surrounding lines to make it unique.`,
        );
      }

      // 新插入的内容跟随匹配位置那一行的换行符
      const replacement = newLf.replace(
        /\n/g,
        lineEndingAt(content, match.index),
      );

      /*
       * 不用 String.replace：
       * newText 里的 "$&"、"$1"、"$$" 会被当成替换模式。
       */
      const updated =
        content.slice(0, match.index)
        + replacement
        + content.slice(match.index + match.text.length);

      await writeFile(absolutePath, updated, "utf8");

      const line =
        content.slice(0, match.index).split("\n").length;

      return {
        content: [
          {
            type: "text",
            text: `Edited ${relativePath} at line ${line}.`,
          },
        ],

        details: {
          path: relativePath,
          line,
        },
      };
    },
  };
}
