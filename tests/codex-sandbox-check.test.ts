import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  findInjectedEnv,
  parseEnvProbe,
  prepareCodexSandbox,
} from "../src/tools/codex-sandbox-check.js";


describe("env probe parsing", () => {
  it("reads the names between the markers and ignores codex's own output around them", () => {
    expect(
      parseEnvProbe("codex says hi\r\nTSA_ENV_BEGIN\r\nPATH\r\nFOO\r\nTSA_ENV_END\r\n"),
    ).toEqual(["PATH", "FOO"]);

    // 没有标记：探测命令根本没跑起来
    expect(parseEnvProbe("setup refresh had errors")).toBeUndefined();
  });

  it("reports names that only the sandbox has, case-insensitively, except codex's CODEX_* markers and cmd's =C: entries", () => {
    expect(
      findInjectedEnv(
        // 沙箱里看到的
        ["Path", "PROMPT", "ANTHROPIC_AUTH_TOKEN", "TSA_SANDBOX_COMMAND", "CODEX_SANDBOX", "=C:", "HOME"],
        // 本机执行同一条命令看到的（cmd 自己也会加 PROMPT）
        ["PATH", "PROMPT", "HOME"],
      ),
    ).toEqual(["ANTHROPIC_AUTH_TOKEN"]);
  });

  it("lets Codex's own safe.directory git config through, but not any other git config", () => {
    const codexGitConfig = [
      "GIT_CONFIG_COUNT",
      "GIT_CONFIG_KEY_0=safe.directory",
      "GIT_CONFIG_VALUE_0",
    ];

    expect(findInjectedEnv(codexGitConfig, [])).toEqual([]);

    expect(
      findInjectedEnv(
        [...codexGitConfig, "GIT_CONFIG_KEY_1=core.sshCommand", "GIT_CONFIG_VALUE_1"],
        [],
      ),
    ).toEqual([
      "GIT_CONFIG_COUNT",
      "GIT_CONFIG_KEY_0",
      "GIT_CONFIG_VALUE_0",
      "GIT_CONFIG_KEY_1",
      "GIT_CONFIG_VALUE_1",
    ]);
  });
});


describe("prepareCodexSandbox", () => {
  let directory: string;
  let fakeCodex: string;
  let savedGitConfig: Record<string, string | undefined>;

  beforeEach(async () => {
    savedGitConfig = {};

    for (const name of Object.keys(process.env)) {
      if (name.toUpperCase().startsWith("GIT_CONFIG_")) {
        savedGitConfig[name] = process.env[name];
        delete process.env[name];
      }
    }

    directory = await mkdtemp(join(tmpdir(), "agent-harness-"));

    /*
     * 假的 codex：模拟用户配置里的 shell_environment_policy.set，
     * 往命令环境里注入 FAKE_INJECTED_TOKEN；收到 set.NAME="" 就把它清空。
     * --stubborn：再注入一个清不掉的；--broken：沙箱起不来。
     */
    fakeCodex = join(directory, "fake-codex.mjs");
    await writeFile(
      fakeCodex,
      [
        'import { spawnSync } from "node:child_process";',
        "const argv = process.argv.slice(2);",
        'if (argv.includes("--broken")) { console.error("setup refresh had errors"); process.exit(1); }',
        "const cleared = argv.flatMap((arg) => { const m = /^shell_environment_policy\\.set\\.(\\w+)=\"\"$/.exec(arg); return m ? [m[1]] : []; });",
        'const env = { ...process.env, FAKE_INJECTED_TOKEN: "secret" };',
        'if (argv.includes("--stubborn")) env.FAKE_STUBBORN = "secret";',
        'for (const name of cleared) if (name !== "FAKE_STUBBORN") env[name] = "";',
        'Object.assign(env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: process.cwd() });',
        'const result = spawnSync(process.env.TSA_SANDBOX_COMMAND, { shell: true, env, stdio: "inherit" });',
        "process.exit(result.status ?? 1);",
      ].join("\n"),
      "utf8",
    );
  });

  afterEach(async () => {
    Object.assign(process.env, savedGitConfig);
    await rm(directory, { recursive: true, force: true });
  });

  it("finds the injected variable, clears it, and checks again", async () => {
    const result = await prepareCodexSandbox({
      codexExe: process.execPath,
      prefixArgs: [fakeCodex],
      mode: "elevated",
      cwd: directory,
    });

    expect(result.clearEnv).toEqual(["FAKE_INJECTED_TOKEN"]);
  });

  it("refuses to start when an injected variable cannot be cleared", async () => {
    await expect(
      prepareCodexSandbox({
        codexExe: process.execPath,
        prefixArgs: [fakeCodex, "--stubborn"],
        mode: "elevated",
        cwd: directory,
      }),
    ).rejects.toThrow("FAKE_STUBBORN");
  });

  it("refuses to start when the sandbox itself does not run, with hints on what to check", async () => {
    const failure = prepareCodexSandbox({
      codexExe: process.execPath,
      prefixArgs: [fakeCodex, "--broken"],
      mode: "elevated",
      cwd: directory,
    });

    await expect(failure).rejects.toThrow("setup refresh had errors");
    await expect(failure).rejects.toThrow("Codex 桌面版");
  });
});
