import {
  lstatSync,
  realpathSync,
} from "node:fs";
import {
  basename,
  dirname,
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

/** 已存在的部分交给操作系统规范化，尚不存在的部分放进 rest。 */
function canonicalize(
  absolutePath: string,
): { existing: string; rest: string[] } {
  const rest: string[] = [];
  let current = absolutePath;

  while (true) {
    try {
      return {
        existing: realpathSync.native(current),
        rest,
      };
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? error.code
          : undefined;

      if (code !== "ENOENT" && code !== "ENOTDIR") {
        throw error;
      }

      const parent = dirname(current);

      if (parent === current) {
        return { existing: current, rest };
      }

      rest.unshift(basename(current));
      current = parent;
    }
  }
}


/** 不区分大小写比较；Windows 还会忽略末尾的点和空格。 */
function comparablePart(
  part: string,
): string {
  const lower = part.toLowerCase();

  return process.platform === "win32"
    ? lower.replace(/[. ]+$/, "")
    : lower;
}


/** 拒绝 .git 目录内的路径，以及 worktree 的 .git 指针文件。 */
export function isInsideGitDir(
  workspaceRoot: string,
  absolutePath: string,
): boolean {
  const root = realpathSync.native(resolve(workspaceRoot));
  const { existing, rest } = canonicalize(absolutePath);

  const parts = [
    ...relative(root, existing).split(sep),
    ...rest,
  ];

  return parts.some(
    (part) => comparablePart(part) === ".git",
  );
}


export function assertNotInsideGitDir(
  workspaceRoot: string,
  absolutePath: string,
  relativePath: string,
): void {
  if (isInsideGitDir(workspaceRoot, absolutePath)) {
    throw new Error(
      `Writing to ${relativePath} is blocked: changes inside .git do not show up in git diff, and Git hooks there run automatically. If a Git change is needed, tell the user what to do instead.`,
    );
  }
}
