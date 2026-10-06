import {
  readFile,
  writeFile,
} from "node:fs/promises";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";

import {
  assertNotInsideGitDir,
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


/** 替换区域前后各展示多少行上下文 */
const CONTEXT_LINES = 3;

/** 返回给模型的片段字符上限，超出时截断并注明 */
export const MAX_SNIPPET_CHARS = 2000;


/**
 * 按行切分，兼容 CRLF：每行末尾的 "\r" 去掉，
 * 末尾换行不算一行（和 read_file 的处理保持一致）。
 */
function splitLines(
  text: string,
): string[] {
  const lines = text
    .split("\n")
    .map((line) =>
      line.endsWith("\r")
        ? line.slice(0, -1)
        : line,
    );

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
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
      assertNotInsideGitDir(workspaceRoot, absolutePath, relativePath);

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

      /*
       * 回显修改后的区域（含前后各 CONTEXT_LINES 行），
       * 让模型能确认改对了，不必再读一遍文件。
       * 逐行不加行号前缀，避免模型把行号当成文件内容复制。
       */
      const lines = splitLines(updated);
      const totalLines = lines.length;

      const endLine =
        updated
          .slice(0, match.index + replacement.length)
          .split("\n").length;

      const fromLine = Math.max(1, line - CONTEXT_LINES);
      const toLine = Math.min(
        totalLines,
        endLine + CONTEXT_LINES,
      );

      const snippetLines =
        lines.slice(fromLine - 1, toLine);

      let snippet = snippetLines.join("\n");
      let truncated = false;

      if (snippet.length > MAX_SNIPPET_CHARS) {
        snippet = snippet.slice(0, MAX_SNIPPET_CHARS);
        truncated = true;
      }

      const header =
        `[lines ${fromLine}-${toLine} of ${totalLines}]`;

      const suffix = truncated
        ? `\n… [snippet truncated to ${MAX_SNIPPET_CHARS} characters]`
        : "";

      return {
        content: [
          {
            type: "text",
            text:
              `Edited ${relativePath} at line ${line}.\n\n`
              + `${header}\n${snippet}${suffix}`,
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
