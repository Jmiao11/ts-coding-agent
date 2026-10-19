import {
  describe,
  expect,
  it,
} from "vitest";

import {
  PassThrough,
} from "node:stream";

import {
  buildMxcRequest,
  createMxcExecutor,
  mxcEnvironment,
  type MxcRequest,
  type MxcSdk,
} from "../src/tools/mxc-executor.js";


describe("mxc environment", () => {
  const hostEnv = {
    // Windows 上变量名的大小写不固定
    Path: "C:\\nvm4w\\nodejs;C:\\Windows\\system32",
    SystemRoot: "C:\\Windows",
    LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
    USERPROFILE: "C:\\Users\\me",
    AGENT_API_KEY: "sk-agent",
    OPENAI_API_KEY: "sk-openai",
    ANTHROPIC_AUTH_TOKEN: "sk-ant",
    GITHUB_TOKEN: "ghp-x",
    SOME_RANDOM_VAR: "x",
  };

  it("passes only allow-listed variables, plus fixed values", () => {
    expect(
      mxcEnvironment(hostEnv, { tempDir: "W:\\.agent-harness\\tmp" }),
    ).toEqual({
      PATH: "C:\\nvm4w\\nodejs;C:\\Windows\\system32",
      SYSTEMROOT: "C:\\Windows",
      LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
      USERPROFILE: "C:\\Users\\me",
      CI: "1",
      NO_COLOR: "1",
      TEMP: "W:\\.agent-harness\\tmp",
      TMP: "W:\\.agent-harness\\tmp",
    });
  });

  it("passes the host's core.autocrlf value to git", () => {
    expect(
      mxcEnvironment(hostEnv, { tempDir: "W:\\tmp", autocrlf: "true" }),
    ).toMatchObject({
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.autocrlf",
      GIT_CONFIG_VALUE_0: "true",
    });
  });
});


describe("mxc request", () => {
  it("builds a restricted request with explicit UI settings", () => {
    expect(
      buildMxcRequest('git status && echo "done"', {
        cwd: "W:\\src",
        driveRoot: "W:\\",
        readonlyPaths: ["C:\\nvm4w\\nodejs"],
        environment: { PATH: "x" },
        timeoutMs: 30_000,
      }),
    ).toEqual({
      command: 'cmd.exe /d /s /c "git status && echo "done""',
      workingDirectory: "W:\\src",
      filesystem: {
        readwritePaths: ["W:\\"],
        readonlyPaths: ["C:\\nvm4w\\nodejs"],
      },
      network: { egress: { default: "deny" } },
      ui: { disable: false, clipboard: "none", allowInputInjection: false },
      environment: { PATH: "x" },
      inheritDefaultEnvironment: false,
      timeoutMs: 35_000,
    });
  });
});


describe("mxc executor", () => {
  function fakeSdk(behavior: { exitCode?: number; hang?: boolean }) {
    const calls: string[] = [];
    const requests: MxcRequest[] = [];

    const sdk: MxcSdk = {
      async spawn(request) {
        requests.push(request);

        const stdout = new PassThrough();
        const stderr = new PassThrough();
        let finish: (exitCode: number) => void = () => {};

        return {
          standardOutput: stdout,
          standardError: stderr,
          wait() {
            calls.push("wait");
            stdout.end("hello\r\n");
            stderr.end("warn\r\n");

            return new Promise((resolvePromise) => {
              finish = (exitCode) => resolvePromise({ exitCode, timedOut: false });

              if (!behavior.hang) {
                finish(behavior.exitCode ?? 0);
              }
            });
          },
          kill() {
            calls.push("kill");
            finish(-1);
          },
          dispose() {
            calls.push("dispose");
          },
        };
      },
    };

    return { sdk, calls, requests };
  }

  const mapping = {
    root: "W:\\",
    toMapped: (hostPath: string) => hostPath.replace("F:\\repo", "W:"),
  };

  it("builds the mapped request, collects both streams, and disposes the process", async () => {
    const { sdk, calls, requests } = fakeSdk({ exitCode: 3 });

    const executor = createMxcExecutor({
      sdk,
      mapping,
      readonlyPaths: ["C:\\nvm4w\\nodejs"],
      environment: { PATH: "x" },
    });

    const result = await executor.run({
      command: "git status",
      cwd: "F:\\repo\\src",
      timeoutMs: 10_000,
    });

    expect(requests).toEqual([
      buildMxcRequest("git status", {
        cwd: "W:\\src",
        driveRoot: "W:\\",
        readonlyPaths: ["C:\\nvm4w\\nodejs"],
        environment: { PATH: "x" },
        timeoutMs: 10_000,
      }),
    ]);
    expect(result.exitCode).toBe(3);
    expect(result.output.toString("utf8")).toContain("hello");
    expect(result.output.toString("utf8")).toContain("warn");
    expect(calls).toEqual(["wait", "dispose"]);
  });

  it("kills on timeout, reports no exit code, and still disposes the process", async () => {
    const { sdk, calls } = fakeSdk({ hang: true });

    const result = await createMxcExecutor({
      sdk,
      mapping,
      readonlyPaths: [],
      environment: {},
    }).run({ command: "sleep", cwd: "F:\\repo", timeoutMs: 50 });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(calls).toEqual(["wait", "kill", "dispose"]);
  });

  it("propagates an SDK startup failure", async () => {
    const sdk: MxcSdk = {
      async spawn() {
        throw new Error("backend_unavailable");
      },
    };

    await expect(
      createMxcExecutor({ sdk, mapping, readonlyPaths: [], environment: {} })
        .run({ command: "echo hi", cwd: "F:\\repo", timeoutMs: 1_000 }),
    ).rejects.toThrow("backend_unavailable");
  });
});
