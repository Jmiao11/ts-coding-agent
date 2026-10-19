import {
  existsSync,
} from "node:fs";

import {
  spawnSync,
} from "node:child_process";

import {
  win32 as path,
} from "node:path";


export type DriveMapping = {
  drive: string;
  root: string;
  toMapped(hostPath: string): string;
  release(): void;
};


type RunSubst = (args: string[]) => { status: number | null; stdout: string };


function decodeOutput(output: Buffer | null): string {
  if (!output) {
    return "";
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(output);
  } catch {
    return new TextDecoder("gbk").decode(output);
  }
}


function defaultRunSubst(args: string[]): { status: number | null; stdout: string } {
  const result = spawnSync("subst.exe", args, {
    encoding: "buffer",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`subst.exe failed: ${result.error.message}`, { cause: result.error });
  }

  return {
    status: result.status,
    stdout: decodeOutput(result.stdout),
  };
}


function parseMappings(output: string): Map<string, string> {
  const mappings = new Map<string, string>();

  for (const line of output.split(/\r?\n/u)) {
    const match = /^\s*([A-Za-z]:)\\:\s*=>\s*(.*?)\s*$/u.exec(line);

    if (match?.[1] && match[2]) {
      mappings.set(match[1].toUpperCase(), match[2]);
    }
  }

  return mappings;
}


function normalizedPath(value: string): string {
  return path.resolve(value).replace(/\\+$/u, "").toLowerCase();
}


function assertSuccess(result: { status: number | null; stdout: string }, action: string): void {
  if (result.status !== 0) {
    throw new Error(`subst ${action} failed (exit code ${result.status}): ${result.stdout.trim()}`);
  }
}


export function mapWorkspaceToDrive(
  workspaceRoot: string,
  runSubst: RunSubst = defaultRunSubst,
): DriveMapping {
  if (process.platform !== "win32") {
    throw new Error("drive mapping is only supported on Windows");
  }

  const workspace = path.resolve(workspaceRoot);
  const list = runSubst([]);
  assertSuccess(list, "query");
  const current = parseMappings(list.stdout);
  const matching = [...current].find(([, target]) => normalizedPath(target) === normalizedPath(workspace));
  const reused = matching !== undefined;
  let drive: string;

  if (matching) {
    drive = matching[0];
  } else {
    const freeDrive = [..."ZYXWVUTSRQPONMLKJIHGFEDCBA"].find((letter) => {
      const candidate = `${letter}:`;
      return !current.has(candidate) && !existsSync(`${candidate}\\`);
    });

    if (!freeDrive) {
      throw new Error("subst could not find an unused drive letter");
    }

    drive = `${freeDrive}:`;
    const created = runSubst([drive, workspace]);
    assertSuccess(created, `create ${drive} mapping`);

    try {
      const verify = runSubst([]);
      assertSuccess(verify, "verify mapping");

      if (normalizedPath(parseMappings(verify.stdout).get(drive) ?? "") !== normalizedPath(workspace)) {
        throw new Error(`subst mapping ${drive} was not present after creation`);
      }
    } catch (error) {
      const verify = runSubst([]);
      if (verify.status === 0 && normalizedPath(parseMappings(verify.stdout).get(drive) ?? "") === normalizedPath(workspace)) {
        runSubst([drive, "/D"]);
      }
      throw new Error(`could not verify subst mapping ${drive}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }

  const root = `${drive}\\`;
  let released = false;
  const mapping: DriveMapping = {
    drive,
    root,
    toMapped(hostPath) {
      const absolute = path.resolve(hostPath);
      const relative = path.relative(workspace, absolute);

      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`path is outside the workspace: ${hostPath}`);
      }

      return relative ? path.join(root, relative) : root;
    },
    release() {
      if (reused || released) {
        return;
      }

      const verify = runSubst([]);
      assertSuccess(verify, "check before release");
      const target = parseMappings(verify.stdout).get(drive);

      if (!target || normalizedPath(target) !== normalizedPath(workspace)) {
        released = true;
        return;
      }

      const removed = runSubst([drive, "/D"]);
      assertSuccess(removed, `release ${drive} mapping`);
      released = true;
    },
  };

  if (!reused) {
    process.on("exit", () => {
      try {
        mapping.release();
      } catch {
        // Exit handlers must remain synchronous and must not interrupt process shutdown.
      }
    });
  }

  return mapping;
}
