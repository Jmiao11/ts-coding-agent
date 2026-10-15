import {
  createCodexSandboxExecutor,
  createHostExecutor,
  SANDBOX_COMMAND_ENV,
  type CodexSandboxExecutorOptions,
  type CommandExecutor,
} from "./command-executor.js";

import {
  decodeOutput,
} from "./run-command.js";


const BEGIN = "TSA_ENV_BEGIN";
const END = "TSA_ENV_END";

/*
 * 在沙箱里只打印「有值的」环境变量名，不打印值：值可能就是要找的密钥。
 * 被清空（set.NAME=""）的变量值为空，不会再出现。
 * 脚本里不能有双引号、$、%：它要原样经过 cmd（Windows）或 sh（测试）。
 */
const PROBE_SCRIPT =
  `const e=process.env;console.log('${BEGIN}');`
  + "for(const k of Object.keys(e))if(e[k])console.log(k);"
  + `console.log('${END}')`;

// 第一次运行 elevated 时 Codex 可能要做初始化，给宽一点
const PROBE_TIMEOUT_MS = 60_000;

// 能安全写进 -c shell_environment_policy.set.NAME="" 的名字
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;


/** 取出标记之间的变量名；没有标记说明探测命令没跑起来 */
export function parseEnvProbe(
  text: string,
): string[] | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim());

  const begin = lines.indexOf(BEGIN);
  const end = lines.indexOf(END, begin + 1);

  if (begin === -1 || end === -1) {
    return undefined;
  }

  return lines.slice(begin + 1, end).filter((line) => line.length > 0);
}


/**
 * 沙箱里有、本机同样的命令里没有的变量名。
 * 和本机执行比较，而不是和我们传的 env 比较：cmd 自己也会加变量（比如 PROMPT），两边会抵消。
 * Windows 的变量名不分大小写，所以统一按大写比较。
 * 不算注入的：我们自己传命令用的 TSA_SANDBOX_COMMAND；Codex 给沙箱进程加的 CODEX_* 标记；
 * cmd 记录各盘符当前目录的隐藏变量（=C: 这类）。
 */
export function findInjectedEnv(
  sandboxNames: string[],
  hostNames: string[],
): string[] {
  const host = new Set(
    hostNames.map((name) => name.toUpperCase()),
  );

  return sandboxNames.filter((name) => {
    const upper = name.toUpperCase();

    return !host.has(upper)
      && upper !== SANDBOX_COMMAND_ENV
      && !upper.startsWith("CODEX_")
      && !upper.startsWith("=");
  });
}


export type PrepareCodexSandboxOptions =
  Omit<CodexSandboxExecutorOptions, "clearEnv"> & {
    /** 在哪个目录里运行探测命令（workspace 根目录） */
    cwd: string;

    /** 沙箱里用来打印变量名的 node，默认就是当前这个 */
    nodeExe?: string;
  };


export class SandboxCheckError extends Error {
  override name = "SandboxCheckError";
}


/** 用 executor 执行探测命令，返回看到的变量名；没跑成功就抛错 */
async function probe(
  executor: CommandExecutor,
  options: PrepareCodexSandboxOptions,
): Promise<string[]> {
  const nodeExe = options.nodeExe ?? process.execPath;

  const result = await executor.run({
    command: `"${nodeExe}" -e "${PROBE_SCRIPT}"`,
    cwd: options.cwd,
    timeoutMs: PROBE_TIMEOUT_MS,
  });

  const text = decodeOutput(result.output);
  const names = parseEnvProbe(text);

  if (result.exitCode !== 0 || names === undefined) {
    const status = result.timedOut
      ? `${PROBE_TIMEOUT_MS / 1000} 秒内没有结束`
      : `退出码 ${result.exitCode}`;

    throw new SandboxCheckError(
      [
        `沙箱自检的探测命令失败（${status}）。输出：`,
        text.trim().slice(-1500) || "(no output)",
        "",
        "可以检查：",
        "  - 先关闭 Codex 桌面版：它运行时会锁住沙箱初始化要更新的文件（setup refresh had errors）",
        "  - 沙箱日志：%USERPROFILE%\\.codex\\.sandbox\\sandbox.<日期>.log",
        "  - mxc 模式需要较新的 Windows 11（build 26200.9278 及以上）",
      ].join("\n"),
    );
  }

  return names;
}


/**
 * 启动前的自检：沙箱能跑命令，并且命令环境里没有比本机多出来的变量。
 *
 * 用户的 Codex 配置（shell_environment_policy.set）会往命令环境里注入变量，
 * 可能包括 API Key。发现了就逐个清空再测一次；清不掉就报错，不退回本机执行。
 *
 * 只检查「多出来的变量名」：如果配置改写的是我们本来就传了的变量（比如 PATH），这里查不出来。
 *
 * 返回需要清空的变量名，交给 createCodexSandboxExecutor 的 clearEnv。
 */
export async function prepareCodexSandbox(
  options: PrepareCodexSandboxOptions,
): Promise<{ clearEnv: string[] }> {
  const sandboxProbe = (clearEnv: string[]) =>
    probe(createCodexSandboxExecutor({ ...options, clearEnv }), options);

  // 本机执行同一条命令作为基准（只打印变量名）
  const hostNames = await probe(createHostExecutor(), options);

  const injected = findInjectedEnv(await sandboxProbe([]), hostNames);

  if (injected.length === 0) {
    return { clearEnv: [] };
  }

  const unsafe = injected.filter((name) => !SAFE_NAME.test(name));

  if (unsafe.length > 0) {
    throw new SandboxCheckError(
      `Codex 往沙箱命令里注入了无法清空的环境变量：${unsafe.join(", ")}。`
      + "请检查 Codex 配置里的 shell_environment_policy.set。",
    );
  }

  const remaining = findInjectedEnv(await sandboxProbe(injected), hostNames);

  if (remaining.length > 0) {
    throw new SandboxCheckError(
      `清空后沙箱命令里仍有注入的环境变量：${remaining.join(", ")}。`
      + "为避免把它们暴露给模型执行的命令，拒绝启动。"
      + "请检查 Codex 配置里的 shell_environment_policy。",
    );
  }

  return { clearEnv: injected };
}