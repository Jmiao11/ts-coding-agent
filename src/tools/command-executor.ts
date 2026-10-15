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
export function createHostExecutor(): CommandExecutor {
  return {
    async run(request) {
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

      // 当子进程 stdout 有数据时，会触发 data 事件，并调用 append()。
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
    },
  };
}