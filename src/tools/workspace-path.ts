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
        break; // write-file.ts 可创建后续尚不存在的目录。
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

/**
 * .env / .env.local / .env.production 等可能含 Key；
 * .env.example / .sample / .template 是模板，不算。
 */
export function isSecretFile(
  relativePath: string,
): boolean {
  const name =
    relativePath.split("/").at(-1) ?? "";

  return (
    /^\.env(\..+)?$/.test(name)
    && !/\.(example|sample|template)$/.test(name)
  );
}


export function assertNotSecretFile(
  relativePath: string,
): void {
  if (isSecretFile(relativePath)) {
    throw new Error(
      `Access to ${relativePath} is blocked because it may contain secrets. Do not try to read it another way (for example with run_command); if you need a value from it, ask the user.`,
    );
  }
}
