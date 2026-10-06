import { statSync } from "node:fs";
import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import Type from "typebox";

import type { AgentTool } from "../agent/types.js";
import {
  assertNotInsideGitDir,
  assertNotSecretFile,
  resolveWorkspacePath,
} from "./workspace-path.js";

const writeFileParameters = Type.Object(
  {
    path: Type.String({
      minLength: 1,
      description:
        "File path relative to the workspace root.",
    }),
    content: Type.String({
      description:
        "Complete UTF-8 file content. Replaces an existing file.",
    }),
  },
  { additionalProperties: false },
);

export type WriteFileDetails = {
  path: string;
  bytes: number;
  created: boolean;
};

export function createWriteFileTool(
  workspaceRoot: string,
): AgentTool<
  typeof writeFileParameters,
  WriteFileDetails
> {
  return {
    name: "write_file",
    label: "Write File",
   description:
    "Create or completely overwrite a UTF-8 text file inside the workspace. Missing parent directories are created. To change part of an existing file, use edit_file.",
    parameters: writeFileParameters,

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

      assertNotSecretFile(relativePath);
      assertNotInsideGitDir(workspaceRoot, absolutePath, relativePath);

      let created = false;

      try {
        if (!statSync(absolutePath).isFile()) {
          throw new Error(
            `Path is not a file: ${parameters.path}`,
          );
        }
      } catch (error) {
        if (
          error instanceof Error
          && "code" in error
          && error.code === "ENOENT"
        ) {
          created = true;
        } else {
          throw error;
        }
      }

      await mkdir(dirname(absolutePath), {
        recursive: true,
      });
      await writeFile(
        absolutePath,
        parameters.content,
        "utf8",
      );

      const bytes = Buffer.byteLength(
        parameters.content,
        "utf8",
      );

      return {
        content: [{
          type: "text",
          text:
            `${created ? "Created" : "Overwrote"} ${relativePath} (${bytes} bytes).`,
        }],
        details: {
          path: relativePath,
          bytes,
          created,
        },
      };
    },
  };
}
