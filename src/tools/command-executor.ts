import {
  spawn,
  type ChildProcess,
} from "node:child_process";


// 内存里最多保留的尾部字节数，防止刷屏命令撑爆内存
const MAX_BUFFERED_BYTES = 400_000;


export type CommandRequest = {
  command: string;

  /** 工作目录（workspace 根目录，已 resolve） */
  cwd: string;

  timeoutMs: number;

  signal?: AbortSignal;
};


export type CommandRunResult = {
  /** stdout 和 stderr 合并后的原始字节（只保留尾部），由调用方解码 */
  output: Buffer;

  /** 输出太多时丢掉过头部：第一行可能是半行 */
  droppedHead: boolean;

  /** 超时或被中止时为 null */
  exitCode: number | null;

  timedOut: boolean;

  /** 用户中止（signal） */
  aborted: boolean;
};


/**
 * 命令「在哪里、以什么方式」执行。
 * run_command 只负责参数、输出解码和给模型看的格式；
 * 本机执行、沙箱执行都实现这个接口，Agent Loop 和工具都不用改。
 */
export type CommandExecutor = {
  run(request: CommandRequest): Promise<CommandRunResult>;
};


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


/** 在本机用系统 shell 执行（Windows：cmd.exe，其他：/bin/sh）。没有沙箱。 */
/**
 * const child = spawn("pnpm test", {
 *   shell: true
 * });
 *
 * const result = await collect(child, request);
 *
 * 收集一个已启动进程的输出，处理超时和中止。本机执行和沙箱执行共用。
 */
async function collect(
  child: ChildProcess,
  request: CommandRequest,
): Promise<CommandRunResult> {
  /*
   * 收原始字节，最后统一解码：
   * setEncoding("utf8") 会在解码时就把 GBK 变成乱码。
   */
  const chunks: Buffer[] = [];
  let bufferedBytes = 0;
  let totalBytes = 0;

  const append = (chunk: Buffer): void => {
    chunks.push(chunk);
    bufferedBytes += chunk.length;
    totalBytes += chunk.length;

    // 只保留尾部：从头部整块丢弃
    while (
      bufferedBytes > MAX_BUFFERED_BYTES
      && chunks.length > 1
    ) {
      const dropped = chunks.shift();

      if (!dropped) {
        break;
      }

      bufferedBytes -= dropped.length;
    }
  };

  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  let timedOut = false;
  let aborted = false;

  const timer = setTimeout(() => {
    timedOut = true;
    killProcessTree(child);
  }, request.timeoutMs);

  const onAbort = (): void => {
    aborted = true;
    killProcessTree(child);
  };

  request.signal?.addEventListener("abort", onAbort, {
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
    request.signal?.removeEventListener("abort", onAbort);
  }

  const output = Buffer.concat(chunks);

  return {
    output,
    droppedHead: totalBytes > output.length,
    exitCode,
    timedOut,
    aborted,
  };
}


/** 在本机用系统 shell 执行（Windows：cmd.exe，其他：/bin/sh）。没有沙箱。 */
export function createHostExecutor(): CommandExecutor {
  return {
    run(request) {
      const child = spawn(
        request.command,
        {
          cwd: request.cwd,
          shell: true,
          env: createChildEnv(),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          detached: process.platform !== "win32",
        },
      );
      // [标准输入 stdin, 标准输出 stdout, 错误输出 stderr]

      return collect(child, request);
    },
  };
}


/** 沙箱里的 cmd.exe 从这个环境变量读取要执行的命令 */
export const SANDBOX_COMMAND_ENV = "TSA_SANDBOX_COMMAND";


export type CodexSandboxMode = "elevated" | "mxc";


export type CodexSandboxArgsOptions = {
  mode: CodexSandboxMode;

  /**
   * 用户 Codex 配置会往命令环境里注入的变量（shell_environment_policy.set），逐个覆盖成空。
   * -c 只能按键合并：set={} 或整节替换都清不掉已有的键（S0 实测）。
   */
  clearEnv?: string[];
};


/** codex.exe 的参数（不含要执行的命令本身） */
export function codexSandboxArgs(
  options: CodexSandboxArgsOptions,
): string[] {
  return [
    "-c", `windows.sandbox=${options.mode}`,

    // 用户配置可能是 inherit = "core"：会把 TSA_SANDBOX_COMMAND 过滤掉
    "-c", "shell_environment_policy.inherit=all",

    ...(options.clearEnv ?? []).flatMap((name) => [
      "-c", `shell_environment_policy.set.${name}=""`,
    ]),

    "sandbox", "--permission-profile", ":workspace", "--",

    /*
     * 命令不放进参数：Codex 重新拼命令行时会把引号转义成 \"，cmd 不认识（S0 实测）。
     * cmd 先展开 %变量% 再解析 & | " 等符号，所以展开后的命令和本机执行一样被解析。
     * 代价：命令里自己的 %变量% 不会再展开（cmd 只展开一轮）。
     */
    "cmd.exe", "/d", "/s", "/c", `%${SANDBOX_COMMAND_ENV}%`,
  ];
}


export type CodexSandboxExecutorOptions = CodexSandboxArgsOptions & {
  /** codex.exe 的完整路径。不能用 codex.cmd：不经过 shell 无法启动 .cmd */
  codexExe: string;

  /** 只用于测试：插在 codex 参数前面（例如假 codex 脚本的路径） */
  prefixArgs?: string[];
};


/** 通过 `codex sandbox` 在 Windows 受限环境中执行（只支持 Windows） */
export function createCodexSandboxExecutor(
  options: CodexSandboxExecutorOptions,
): CommandExecutor {
  const args = [
    ...(options.prefixArgs ?? []),
    ...codexSandboxArgs(options),
  ];

  return {
    run(request) {
      const child = spawn(
        options.codexExe,
        args,
        {
          cwd: request.cwd,
          shell: false,
          env: {
            ...createChildEnv(),
            [SANDBOX_COMMAND_ENV]: request.command,
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          detached: process.platform !== "win32",
        },
      );

      return collect(child, request);
    },
  };
}