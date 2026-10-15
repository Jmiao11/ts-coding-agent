import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  CommandExecutor,
  CommandRequest,
  CommandRunResult,
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
});