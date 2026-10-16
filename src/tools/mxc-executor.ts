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
