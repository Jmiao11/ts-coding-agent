import type {
  Readable,
} from "node:stream";

import {
  collect,
  type CommandExecutor,
} from "./command-executor.js";


/** 沙箱里允许传入的宿主环境变量名；其余变量一律不传。 */
export const MXC_ENV_ALLOWLIST = [
  "SYSTEMROOT",
  "WINDIR",
  "LOCALAPPDATA",
  "APPDATA",
  "USERPROFILE",
  "PATH",
  "PATHEXT",
  "COMSPEC",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "OS",
] as const;


export type MxcEnvironmentOptions = {
  tempDir: string;
  autocrlf?: string;
};


export function mxcEnvironment(
  hostEnv: Record<string, string | undefined>,
  options: MxcEnvironmentOptions,
): Record<string, string> {
  const byUpperName = new Map(
    Object.entries(hostEnv).map(([name, value]) => [name.toUpperCase(), value]),
  );
  const environment: Record<string, string> = {};

  for (const name of MXC_ENV_ALLOWLIST) {
    const value = byUpperName.get(name);

    if (value !== undefined) {
      environment[name] = value;
    }
  }

  Object.assign(environment, {
    CI: "1",
    NO_COLOR: "1",
    TEMP: options.tempDir,
    TMP: options.tempDir,
  });

  if (options.autocrlf !== undefined) {
    Object.assign(environment, {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.autocrlf",
      GIT_CONFIG_VALUE_0: options.autocrlf,
    });
  }

  return environment;
}


export type MxcRequest = {
  command: string;
  workingDirectory: string;
  filesystem: { readwritePaths: string[]; readonlyPaths: string[] };
  network: { egress: { default: "deny" } };
  ui: { disable: false; clipboard: "none"; allowInputInjection: false };
  environment: Record<string, string>;
  inheritDefaultEnvironment: false;
  timeoutMs: number;
};


export type BuildMxcRequestOptions = {
  cwd: string;
  driveRoot: string;
  readonlyPaths: string[];
  environment: Record<string, string>;
  timeoutMs: number;
};


const MXC_TIMEOUT_GRACE_MS = 5_000;


export function buildMxcRequest(
  command: string,
  options: BuildMxcRequestOptions,
): MxcRequest {
  return {
    command: `cmd.exe /d /s /c "${command}"`,
    workingDirectory: options.cwd,
    filesystem: {
      readwritePaths: [options.driveRoot],
      readonlyPaths: options.readonlyPaths,
    },
    network: { egress: { default: "deny" } },
    ui: { disable: false, clipboard: "none", allowInputInjection: false },
    environment: options.environment,
    inheritDefaultEnvironment: false,
    timeoutMs: options.timeoutMs + MXC_TIMEOUT_GRACE_MS,
  };
}


/** SDK 的 MxcProcess 里我们用到的部分 */
export type MxcProcessHandle = {
  readonly standardOutput: Readable | null;
  readonly standardError: Readable | null;
  wait(): Promise<{ exitCode: number; timedOut: boolean }>;
  kill(): void;
  dispose(): void;
};


/** SDK 的最小接口：真实 SDK 由调用方动态导入，测试使用替身。 */
export type MxcSdk = {
  spawn(request: MxcRequest): Promise<MxcProcessHandle>;
};


export type MxcExecutorOptions = {
  sdk: MxcSdk;
  mapping: {
    root: string;
    toMapped(hostPath: string): string;
  };
  readonlyPaths: string[];
  environment: Record<string, string>;
};


/** 在 MXC 沙箱里执行；沙箱不可用时直接报错，不回退到宿主执行。 */
export function createMxcExecutor(
  options: MxcExecutorOptions,
): CommandExecutor {
  return {
    async run(request) {
      const sandboxed = await options.sdk.spawn(
        buildMxcRequest(request.command, {
          cwd: options.mapping.toMapped(request.cwd),
          driveRoot: options.mapping.root,
          readonlyPaths: options.readonlyPaths,
          environment: options.environment,
          timeoutMs: request.timeoutMs,
        }),
      );

      let killed = false;

      try {
        return await collect(
          {
            stdout: sandboxed.standardOutput,
            stderr: sandboxed.standardError,
            kill: () => {
              killed = true;
              sandboxed.kill();
            },
            wait: async () => {
              const { exitCode } = await sandboxed.wait();
              return killed ? null : exitCode;
            },
          },
          request,
        );
      } finally {
        sandboxed.dispose();
      }
    },
  };
}
