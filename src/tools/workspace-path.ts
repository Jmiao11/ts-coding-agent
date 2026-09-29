import { lstatSync } from "node:fs";
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export type WorkspacePath = {
  absolutePath: string;
  relativePath: string;
};

export function resolveWorkspacePath(
  workspaceRoot: string,
  requestedPath: string,
): WorkspacePath {
  const root = resolve(workspaceRoot);
  const absolutePath = resolve(root, requestedPath);
  const relativePath = relative(root, absolutePath);

  if (
    relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
  ) {
    throw new Error(
      `Path is outside the workspace: ${requestedPath}`,
    );
  }

  // 不允许路径中的现有部分是符号链接，以免链接指向 workspace 外。
  let current = root;

  for (const part of relativePath.split(sep)) {
    current = join(current, part);

    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(
          `Path contains a symbolic link: ${requestedPath}`,
        );
      }
    } catch (error) {
      if (
        error instanceof Error
        && "code" in error
        && error.code === "ENOENT"
      ) {
        break; // write_file.ts 可创建后续尚不存在的目录。
      }

      throw error;
    }
  }

  return {
    absolutePath,
    relativePath:
      relativePath === ""
        ? "."
        : relativePath.split(sep).join("/"),
  };
}