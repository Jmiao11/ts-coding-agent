import {
  readFile,
  writeFile,
} from "node:fs/promises";
import Type from "typebox";

import type { AgentTool } from "../agent/types.js";
import {
  resolveWorkspacePath,
} from "./workspace-path.js";

const editFileParameters = Type.Object(
  {
    path: Type.String({ minLength: 1 }),
    oldText: Type.String({
      minLength: 1,
      description:
        "Exact text to replace. Include enough context to make it unique.",
    }),
    newText: Type.String({
      description: "Replacement text; may be empty.",
    }),
  },
  { additionalProperties: false },
);
// { additionalProperties: false } 表示这个对象不允许出现这三个字段以外的属性。

export type EditFileDetails = {
  path: string;
  line: number;
};

function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

// editFileParameters 是一个值：运行时的 TypeBox Schema。typeof editFileParameters 用来在类型位置引用这个值的 TypeScript 类型，让 AgentTool 根据 Schema 推导输入参数
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
      "Replace exactly one occurrence of oldText in an existing UTF-8 file. Read the file first. If the text is missing, read again; if it appears more than once, include surrounding lines.",
    parameters: editFileParameters,

    async execute(_toolCallId, parameters) {
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

      const original = await readFile(
        absolutePath,
        "utf8",
      );
      const usesCrlf = original.includes("\r\n");

      if (
        usesCrlf
        && original.replace(/\r\n/g, "").includes("\n")
      ) {
        throw new Error(
          `Mixed line endings in ${relativePath}; edit_file cannot preserve them.`,
        );
      }

      const content = toLf(original);
      const oldText = toLf(parameters.oldText);
      const newText = toLf(parameters.newText);

      if (oldText === newText) {
        throw new Error(
          "oldText and newText are identical.",
        );
      }

      const index = content.indexOf(oldText);

      if (index === -1) {
        throw new Error(
          `oldText not found in ${relativePath}. Read the file again and copy the exact text.`,
        );
      }

      if (
        content.indexOf(oldText, index + 1)
        !== -1
      ) {
        throw new Error(
          `oldText appears more than once in ${relativePath}. Include surrounding lines to make it unique.`,
        );
      }

      // 用切片拼接，避免把 newText 中的 $&、$$ 当成替换指令。
      const updated =
        content.slice(0, index)
        + newText
        + content.slice(index + oldText.length);

      await writeFile(
        absolutePath,
        usesCrlf
          ? updated.replace(/\n/g, "\r\n")
          : updated,
        "utf8",
      );

      const line =
        content.slice(0, index).split("\n").length;

      return {
        content: [{
          type: "text",
          text: `Edited ${relativePath} at line ${line}.`,
        }],
        details: {
          path: relativePath,
          line,
        },
      };
    },
  };
}