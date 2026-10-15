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
  describe,
  expect,
  it,
} from "vitest";

import {
  codexSandboxArgs,
  createCodexSandboxExecutor,
  type CommandExecutor,
  type CommandRequest,
  type CommandRunResult,
} from "../src/tools/command-executor.js";

import {
  createRunCommandTool,
} from "../src/tools/run-command.js";


/** 记下收到的请求，返回预先写好的结果：不启动任何进程 */
function fakeExecutor(result: Partial<CommandRunResult>) {
  const requests: CommandRequest[] = [];

  const executor: CommandExecutor = {
    async run(request) {
      requests.push(request);

      return {
        output: Buffer.alloc(0),
        droppedHead: false,
        exitCode: 0,
        timedOut: false,
        aborted: false,
        ...result,
      };
    },
  };

  return { executor, requests };
}


describe("run_command with an injected executor", () => {
  it("hands the command, workspace, timeout and signal to the executor and formats its result", async () => {
    const { executor, requests } = fakeExecutor({
      output: Buffer.from("hello\r\n", "utf8"),
      exitCode: 0,
    });

    const controller = new AbortController();
    const tool = createRunCommandTool("/work", { executor });

    const result = await tool.execute(
      "call-1",
      { command: "echo hello", timeoutSeconds: 5 },
      controller.signal,
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      command: "echo hello",
      timeoutMs: 5000,
      signal: controller.signal,
    });
    expect(requests[0]?.cwd).toMatch(/work$/);

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toBe("$ echo hello\nhello\nExit code: 0");
    expect(result.details).toEqual({
      command: "echo hello",
      exitCode: 0,
      timedOut: false,
      truncated: false,
    });
  });

  it("reports timeouts, interruptions and a dropped head the same way as before", async () => {
    const timedOut = await createRunCommandTool("/work", {
      executor: fakeExecutor({ exitCode: null, timedOut: true }).executor,
    }).execute("call-1", { command: "sleep", timeoutSeconds: 2 });

    expect(timedOut.isError).toBe(true);
    expect(timedOut.content[0]?.text).toBe(
      "$ sleep\n(no output)\nCommand timed out after 2s and was killed.",
    );

    await expect(
      createRunCommandTool("/work", {
        executor: fakeExecutor({ exitCode: null, aborted: true }).executor,
      }).execute("call-2", { command: "sleep" }),
    ).rejects.toThrow("Command stopped: the user interrupted the run before it finished: sleep");

    // 头部丢过数据时，第一行可能是半行：整行丢掉，并标记为截断
    const dropped = await createRunCommandTool("/work", {
      executor: fakeExecutor({
        output: Buffer.from("half line\nlast line\n", "utf8"),
        droppedHead: true,
        exitCode: 1,
      }).executor,
    }).execute("call-3", { command: "noisy" });

    expect(dropped.isError).toBe(true);
    expect(dropped.details.truncated).toBe(true);
    expect(dropped.content[0]?.text).not.toContain("half line");
    expect(dropped.content[0]?.text).toContain("last line\nExit code: 1");
  });



describe("codex sandbox executor", () => {
  let directory: string | undefined;

  afterEach(async () => {
    delete process.env.AGENT_PROBE_SECRET;

    if (directory) {
      await rm(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it("builds the codex arguments: mode, our env policy, cleared variables, and the command passed by env var", () => {
    expect(
      codexSandboxArgs({ mode: "elevated", clearEnv: ["ANTHROPIC_AUTH_TOKEN"] }),
    ).toEqual([
      "-c", "windows.sandbox=elevated",
      "-c", "shell_environment_policy.inherit=all",
      "-c", 'shell_environment_policy.set.ANTHROPIC_AUTH_TOKEN=""',
      "sandbox", "--permission-profile", ":workspace", "--",
      // 命令本身不进参数：Codex 会把参数里的引号转义成 \"，cmd 不认识
      "cmd.exe", "/d", "/s", "/c", "%TSA_SANDBOX_COMMAND%",
    ]);
  });

  it("runs codex with those arguments, hands the command over in TSA_SANDBOX_COMMAND and keeps AGENT_* out", async () => {
    directory = await mkdtemp(join(tmpdir(), "agent-harness-"));

    // 假的 codex：打印收到的参数和环境，按命令决定退出码
    const fakeCodex = join(directory, "fake-codex.mjs");
    await writeFile(
      fakeCodex,
      [
        "const command = process.env.TSA_SANDBOX_COMMAND;",
        "console.log(JSON.stringify({ argv: process.argv.slice(2), command, secret: process.env.AGENT_PROBE_SECRET ?? null }));",
        'process.exit(command === "fail" ? 3 : 0);',
      ].join("\n"),
      "utf8",
    );

    process.env.AGENT_PROBE_SECRET = "should-not-leak";

    const executor = createCodexSandboxExecutor({
      codexExe: process.execPath,
      prefixArgs: [fakeCodex],
      mode: "elevated",
    });

    const ok = await executor.run({
      command: 'node -e "console.log(1)"',
      cwd: directory,
      timeoutMs: 10_000,
    });

    expect(ok.exitCode).toBe(0);
    expect(JSON.parse(ok.output.toString("utf8"))).toEqual({
      argv: codexSandboxArgs({ mode: "elevated" }),
      command: 'node -e "console.log(1)"',
      secret: null,
    });

    const failed = await executor.run({
      command: "fail",
      cwd: directory,
      timeoutMs: 10_000,
    });

    expect(failed.exitCode).toBe(3);
  });
});

});