import {
  spawn,
  type ChildProcess,
} from "node:child_process";

import {
  resolve,
} from "node:path";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";


const DEFAULT_TIMEOUT_SECONDS = 60;
const MAX_TIMEOUT_SECONDS = 600;

// 返回给模型的上限
const MAX_OUTPUT_LINES = 200;
const MAX_OUTPUT_CHARS = 20_000;

// 内存里最多保留的尾部，防止刷屏命令撑爆内存
const MAX_BUFFERED_CHARS = 200_000;

const SHELL_NAME =
  process.platform === "win32"
    ? "cmd.exe"
    : "/bin/sh";


const runCommandParameters =
  Type.Object(
    {
      command: Type.String({
        minLength: 1,
        description:
          `Shell command to run in the workspace root (shell: ${SHELL_NAME}).`,
      }),

      timeoutSeconds: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: MAX_TIMEOUT_SECONDS,
          description:
            `Timeout in seconds. Default ${DEFAULT_TIMEOUT_SECONDS}.`,
        }),
      ),
    },
    {
      additionalProperties: false,
    },
  );


export type RunCommandDetails = {
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
};


/**
 * 保留输出的尾部：测试失败汇总、编译错误都在最后。
 */
export function truncateTail(
  text: string,
  maxLines: number,
  maxChars: number,
): {
  text: string;
  truncated: boolean;
} {
  let result = text;

  const lines = result.split("\n");

  if (lines.length > maxLines) {
    result = lines.slice(-maxLines).join("\n");
  }

  if (result.length > maxChars) {
    result = result.slice(-maxChars);
  }

  return {
    text: result,
    truncated: result.length < text.length,
  };
}


function createChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "1",
    NO_COLOR: "1",
  };

  // 不把模型 API Key 等交给模型能执行的命令
  for (const key of Object.keys(env)) {
    if (key.startsWith("AGENT_")) {
      delete env[key];
    }
  }

  return env;
}


function killProcessTree(
  child: ChildProcess,
): void {
  if (child.pid === undefined) {
    return;
  }

  if (process.platform === "win32") {
    /*
     * child 是 cmd.exe，真正运行的 node / vitest 是它的子进程。
     * /T：连同整棵进程树一起结束。
     */
    spawn(
      "taskkill",
      ["/pid", String(child.pid), "/T", "/F"],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    ).on("error", () => {});

    return;
  }

  try {
    // detached 让 child 成为进程组组长；负 pid = 整个进程组
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}


export function createRunCommandTool(
  workspaceRoot: string,
): AgentTool<
  typeof runCommandParameters,
  RunCommandDetails
> {
  const root = resolve(workspaceRoot);

  return {
    name: "run_command",

    label: "Run Command",

    description:
      `Run a shell command in the workspace root and return its combined stdout/stderr and exit code. Use it to run tests, builds, git and other CLI tools. The shell is ${SHELL_NAME}. Commands cannot read interactive input. Long output is truncated to the last ${MAX_OUTPUT_LINES} lines.`,

    parameters:
      runCommandParameters,


    async execute(
      _toolCallId,
      parameters,
      signal,
    ) {
      signal?.throwIfAborted();

      const timeoutSeconds =
        parameters.timeoutSeconds
        ?? DEFAULT_TIMEOUT_SECONDS;

      const child = spawn(
        parameters.command,
        {
          cwd: root,
          shell: true,
          env: createChildEnv(),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          detached: process.platform !== "win32",
        },
      );
      // [标准输入 stdin, 标准输出 stdout, 错误输出 stderr]

      let output = "";
      let totalChars = 0;

      const append = (chunk: string): void => {
        totalChars += chunk.length;
        output += chunk;

        if (output.length > MAX_BUFFERED_CHARS) {
          output = output.slice(-MAX_BUFFERED_CHARS);
        }
      };

      // setEncoding：跨 chunk 的 UTF-8 多字节字符不会被切坏
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", append);
      // 只要命令产生正常输出，就调用 append 函数。
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", append);

      let timedOut = false;
      let aborted = false;

      const timer = setTimeout(() => {
        timedOut = true;
        killProcessTree(child);
      }, timeoutSeconds * 1000);

      const onAbort = (): void => {
        aborted = true;
        killProcessTree(child);
      };

      signal?.addEventListener("abort", onAbort, {
        once: true,
      });

      let exitCode: number | null;

      try {
        exitCode = await new Promise<number | null>(
          (resolvePromise, reject) => {
            child.once("error", reject);

            // close：进程退出且输出管道都已关闭
            child.once("close", (code) => {
              resolvePromise(code);
            });
          },
        );
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }

      if (aborted) {
        throw new Error(
          `Command aborted: ${parameters.command}`,
        );
      }

      const tail = truncateTail(
        output.replace(/\r\n/g, "\n"),
        MAX_OUTPUT_LINES,
        MAX_OUTPUT_CHARS,
      );

      const truncated =
        tail.truncated
        || totalChars > output.length;

      const parts = [`$ ${parameters.command}`];

      if (truncated) {
        parts.push(
          `[output truncated: showing only the last ${MAX_OUTPUT_LINES} lines / ${MAX_OUTPUT_CHARS} chars]`,
        );
      }

      parts.push(tail.text.trimEnd() || "(no output)");

      parts.push(
        timedOut
          ? `Command timed out after ${timeoutSeconds}s and was killed.`
          : `Exit code: ${exitCode}`,
      );

      return {
        content: [
          {
            type: "text",
            text: parts.join("\n"),
          },
        ],

        details: {
          command: parameters.command,
          exitCode,
          timedOut,
          truncated,
        },

        isError:
          timedOut || exitCode !== 0,
      };
    },
  };
}