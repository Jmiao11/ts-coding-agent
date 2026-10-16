import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildMxcRequest,
  mxcEnvironment,
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
