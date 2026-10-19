#!/usr/bin/env node
// 这个脚本交给 Node.js 执行

import {
  spawnSync,
} from "node:child_process";

import {
  existsSync,
  statSync,
} from "node:fs";

import {
  homedir,
} from "node:os";

import {
  join,
  resolve,
} from "node:path";

import {
  createInterface,
} from "node:readline/promises";

import {
  parseArgs,
} from "node:util";

import {
  Agent,
} from "./agent/agent.js";

import {
  captureFileChange,
} from "./checkpoint/file-change.js";

import {
  applyUndo,
  createUndoNote,
  findConflicts,
  findNewConflicts,
  planUndo,
  unannouncedUndos,
} from "./checkpoint/undo.js";

import type {
  WriteTarget,
  WriteTracker,
} from "./tools/write-tracker.js";

import type {
  TextContent,
} from "./ai/types.js";

import {
  createOpenAICompatibleStreamFn,
} from "./ai/providers/openai-compatible.js";

import {
  createCompactor,
  type CompactionCheckpoint,
  type Compactor,
} from "./context/compaction.js";

import {
  textOf,
} from "./context/token-estimate.js";

import {
  BudgetExceededError,
  createBudgetExtension,
} from "./extensions/budget.js";

import {
  createCommandApprovalExtension,
} from "./extensions/command-approval.js";

import {
  createLoggerExtension,
} from "./logging/logger-extension.js";

import {
  createCodingSystemPrompt,
  createSubagentSystemPrompt,
} from "./prompts/coding-system-prompt.js";

import {
  createTaskTool,
  type TaskDetails,
} from "./tools/task.js";

import {
  sanitizeForLlm,
} from "./session/sanitize-for-llm.js";

import {
  createSessionWriter,
  findMostRecentSession,
  getSessionDir,
  listSessions,
  loadSession,
  newSessionFile,
  rebuildSession,
  type RebuiltSession,
  type SessionSummary,
  type SessionWriter,
} from "./session/session-store.js";

import {
  createEditFileTool,
} from "./tools/edit-file.js";

import {
  createListDirectoryTool,
} from "./tools/list-directory.js";

import {
  createReadFileTool,
} from "./tools/read-file.js";

import {
  createRunCommandTool,
} from "./tools/run-command.js";

import {
  createCodexSandboxExecutor,
  createHostExecutor,
  type CommandExecutor,
} from "./tools/command-executor.js";

import {
  prepareCodexSandbox,
} from "./tools/codex-sandbox-check.js";

import {
  setupMxcSandbox,
} from "./tools/mxc-setup.js";

import {
  createSearchTextTool,
} from "./tools/search-text.js";

import {
  createWriteFileTool,
} from "./tools/write-file.js";

import type {
  AgentMessage,
} from "./agent/types.js";


const DEFAULT_ENV_FILE =
  join(homedir(), ".agent-harness.env");

const HELP = `用法：
  ts-coding-agent [选项] "任务描述"   运行一个任务后退出
  ts-coding-agent [选项]              交互模式：连续输入多个任务（需要交互式终端）

在 Git 仓库里运行 coding agent。改动不会自动提交，请用 git diff 审查。

选项：
  -c, --continue          继续这个 workspace 最近的会话
  -r, --resume            从这个 workspace 的会话列表里选一个继续
      --session <id>      按 id 前缀继续指定的会话（-r 列表里显示的 8 位）
  -w, --workspace <dir>   工作目录（默认：当前目录；必须在 Git 仓库里）
  -m, --model <id>        模型 ID（默认：AGENT_MODEL）
      --env-file <path>   API 配置文件（默认：${DEFAULT_ENV_FILE}）
      --context-window <n>  工作预算，超过就压缩（默认 128000，不是模型上限；调小可用来测试压缩）
      --sandbox <host|codex|mxc>  run_command 在哪里执行（默认 host：本机，没有隔离）
                          codex：通过 codex sandbox 执行（只支持 Windows，需要 AGENT_CODEX_EXE）
                          mxc：通过 Microsoft MXC 执行（实验性，只支持 Windows，需要 Node 24）
  -h, --help              显示帮助

需要的配置（环境变量，或写在 env 文件里）：
  AGENT_API_KEY  AGENT_BASE_URL  AGENT_MODEL
  可选：AGENT_THINKING=enabled 或 disabled（DeepSeek：显式开启或关闭 thinking）
   --sandbox codex 时：AGENT_CODEX_EXE=codex.exe 的完整路径（不能是 codex.cmd）
                      AGENT_SANDBOX_MODE=elevated（默认）或 mxc
  --sandbox mxc 时：AGENT_MXC_READONLY=额外只读授权的目录，用分号分隔（默认只授权 node 所在目录）

交互模式：/exit、Ctrl+C 或 Ctrl+D 退出；任务运行中按 Ctrl+C 只中止当前任务。
任何时候连按两次 Ctrl+C 都会强制退出。`;


function fail(
  message: string,
): never {
  console.error(message);
  process.exit(1);
}


// ---------- 参数 ----------

function parseCliArgs() {
  return parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      continue: { type: "boolean", short: "c" },
      resume: { type: "boolean", short: "r" },
      session: { type: "string" },
      workspace: { type: "string", short: "w" },
      model: { type: "string", short: "m" },
      "env-file": { type: "string" },
      "context-window": { type: "string" },
      sandbox: { type: "string" },
    },
  });
}

let args: ReturnType<typeof parseCliArgs>;

try {
  args = parseCliArgs();
} catch (error) {
  fail(
    `${error instanceof Error ? error.message : String(error)}\n\n${HELP}`,
  );
}

const { values, positionals } = args;

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

const sessionModes = [
  values.continue,
  values.resume,
  values.session !== undefined,
].filter(Boolean).length;

if (sessionModes > 1) {
  fail("-c、-r、--session 只能选一个。");
}

// 写了任务描述：跑一次就退出；没写：进入交互模式
const argTask = positionals.join(" ").trim();
const interactive = argTask.length === 0;

if (interactive && !process.stdin.isTTY) {
  fail(
    sessionModes === 0
      ? HELP
      : "缺少任务描述：非交互环境里请把任务写在命令里。",
  );
}


// ---------- 配置 ----------
// Key 默认放在主目录，而不是被修改的项目里

const envFile =
  values["env-file"] ?? DEFAULT_ENV_FILE;

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
} else if (values["env-file"] !== undefined) {
  fail(`找不到 env 文件：${envFile}`);
}

function requiredEnv(
  name: string,
): string {
  const value = process.env[name];

  if (!value) {
    fail(
      `缺少配置 ${name}。请设置环境变量，或写进 ${envFile}。`,
    );
  }

  return value;
}

const apiKey = requiredEnv("AGENT_API_KEY");
const baseUrl = requiredEnv("AGENT_BASE_URL");
const modelId = values.model ?? requiredEnv("AGENT_MODEL");

// DeepSeek 的 thinking 开关。开启时思考过程存进消息的 thinking 块，之后每次请求原样回传。
// 不设置就什么都不发，用 Provider 的默认值（其他 Provider 可能不认识这个字段）。
const thinking = process.env.AGENT_THINKING || undefined;

if (
  thinking !== undefined
  && thinking !== "enabled"
  && thinking !== "disabled"
) {
  fail(
    `AGENT_THINKING 只能是 enabled 或 disabled（收到：${thinking}）。`,
  );
}

// 工作预算，不是模型上限：DeepSeek 的窗口是 1M，但 Context 越长越慢、越贵。
// 估算超过 (这个值 - reserve) 就压缩。
const DEFAULT_CONTEXT_WINDOW = 128_000;

const contextWindow =
  values["context-window"] === undefined
    ? DEFAULT_CONTEXT_WINDOW
    : Number(values["context-window"]);

if (!Number.isInteger(contextWindow) || contextWindow < 8_000) {
  fail("--context-window 必须是不小于 8000 的整数");
}

const compactionSettings = {
  contextWindow,
  reserveTokens: Math.min(16_384, Math.floor(contextWindow / 8)),
  keepRecentTokens: Math.min(20_000, Math.floor(contextWindow / 4)),
};


// ---------- Workspace：必须在 Git 仓库里 ----------

const workspaceRoot = resolve(
  values.workspace ?? process.cwd(),
);

if (
  !existsSync(workspaceRoot)
  || !statSync(workspaceRoot).isDirectory()
) {
  fail(`工作目录不存在：${workspaceRoot}`);
}

const gitStatus = spawnSync(
  "git",
  ["status", "--porcelain"],
  {
    cwd: workspaceRoot,
    encoding: "utf8",
  },
);

if (gitStatus.error || gitStatus.status !== 0) {
  fail(
    `${workspaceRoot} 不在 Git 仓库里（或没有安装 git）。\n`
    + "Agent 只在 Git 仓库里运行，这样改动才能用 git diff 审查、用 git restore 回滚。",
  );
}

if (gitStatus.stdout.trim().length > 0) {
  console.warn(
    "⚠ 工作区有未提交的改动，建议先 commit，方便单独审查和回滚 Agent 的改动。\n",
  );
}

// ---------- 命令在哪里执行：本机或 Codex 沙箱 ----------
// 沙箱起不来就拒绝启动，绝不悄悄退回本机执行

const sandbox = values.sandbox ?? "host";

if (sandbox !== "host" && sandbox !== "codex" && sandbox !== "mxc") {
  fail(`--sandbox 只能是 host、codex 或 mxc（收到：${sandbox}）。`);
}

let commandExecutor: CommandExecutor;
let sandboxLabel: string;

if (sandbox === "host") {
  commandExecutor = createHostExecutor();
  sandboxLabel = "host（命令直接在本机执行，没有隔离）";
} else if (sandbox === "codex") {
  if (process.platform !== "win32") {
    fail("--sandbox codex 目前只支持 Windows。");
  }

  const codexExe = requiredEnv("AGENT_CODEX_EXE");

  // Node 不经过 shell 无法启动 .cmd，所以必须是真正的 codex.exe
  if (!codexExe.toLowerCase().endsWith(".exe") || !existsSync(codexExe)) {
    fail(
      `AGENT_CODEX_EXE 必须是存在的 codex.exe 完整路径（收到：${codexExe}）。\n`
      + "npm 安装的一般在 <npm 全局目录>\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe",
    );
  }

  const mode = process.env.AGENT_SANDBOX_MODE || "elevated";

  if (mode !== "elevated" && mode !== "mxc") {
    fail(`AGENT_SANDBOX_MODE 只能是 elevated 或 mxc（收到：${mode}）。`);
  }

  console.log("正在检查 Codex 沙箱…");

  let clearEnv: string[];

  try {
    ({ clearEnv } = await prepareCodexSandbox({
      codexExe,
      mode,
      cwd: workspaceRoot,
    }));
  } catch (error) {
    fail(
      `${error instanceof Error ? error.message : String(error)}\n\n`
      + "不会退回本机执行。确实要在本机执行命令，请去掉 --sandbox codex。",
    );
  }

  commandExecutor = createCodexSandboxExecutor({
    codexExe,
    mode,
    clearEnv,
  });

  sandboxLabel = `codex（${mode}）`
    + (clearEnv.length > 0
      ? `，已清空 Codex 配置注入的变量：${clearEnv.join(", ")}`
      : "");
} else {
  console.log("正在检查 MXC 沙箱…");

  try {
    const mxc = await setupMxcSandbox(workspaceRoot);

    commandExecutor = mxc.executor;
    sandboxLabel = mxc.label;

    for (const warning of mxc.warnings) {
      console.warn(`⚠ MXC：${warning}`);
    }
  } catch (error) {
    fail(
      `${error instanceof Error ? error.message : String(error)}\n\n`
      + "不会退回本机执行。确实要在本机执行命令，请去掉 --sandbox mxc。",
    );
  }
}


// ---------- 终端输入 ----------

function oneLine(
  text: string,
  max = 60,
): string {
  const flat = text.replace(/\s+/g, " ").trim();

  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}


function formatTime(
  date: Date,
): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}


/**
 * 读一行输入。Ctrl+C 或 Ctrl+D（输入流关闭）时返回 null，由调用方决定怎么处理。
 * 用于选会话和 REPL 提示符；命令确认另有自己的处理（Ctrl+C 要中止 Agent）。
 */
async function promptLine(
  question: string,
): Promise<string | null> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string | null>((resolvePromise) => {
    let settled = false;

    const settle = (value: string | null): void => {
      if (!settled) {
        settled = true;
        resolvePromise(value);
      }
    };

    rl.on("SIGINT", () => {
      console.log();
      settle(null);
      rl.close();
    });

    rl.once("close", () => settle(null));

    rl.question(question).then(
      (answer) => {
        settle(answer);
        rl.close();
      },
      () => settle(null),
    );
  });
}


// ---------- Session：每条完整消息追加一行 JSONL ----------
// 放在主目录而不是 workspace：不污染仓库，transcript 里有读过的文件内容

const MAX_LISTED_SESSIONS = 20;


/** 取消时返回 undefined，由调用方决定如何处理 */
async function pickSession(
  sessions: SessionSummary[],
): Promise<string | undefined> {
  const shown = sessions.slice(0, MAX_LISTED_SESSIONS);

  console.log(
    `\n${workspaceRoot} 的会话（最近活动的在前）：\n`,
  );

  shown.forEach((session, index) => {
    console.log(
      `[${index + 1}] ${formatTime(session.modified)}  ${session.id.slice(0, 8)}  ${session.messageCount} 条消息${session.compacted ? "，已压缩" : ""}`,
    );

    console.log(
      `    首条：${oneLine(session.firstUserText)}`,
    );

    if (session.lastUserText !== session.firstUserText) {
      console.log(
        `    最后：${oneLine(session.lastUserText)}`,
      );
    }
  });

  if (sessions.length > shown.length) {
    console.log(
      `\n（还有 ${sessions.length - shown.length} 个更早的会话没有列出，可以按 id 前缀指定：/resume <id> 或 --session <id>）`,
    );
  }

  const answer = await promptLine(
    "\n继续哪一个？输入编号（直接回车取消）：",
  );

  const choice = Number(answer?.trim() ?? "");

  return Number.isInteger(choice)
    ? shown[choice - 1]?.path
    : undefined;
}


/** 匹配失败时返回说明文字 */
function matchSessionPrefix(
  sessions: SessionSummary[],
  prefix: string,
): SessionSummary | string {
  const matches = sessions.filter(
    (session) => session.id.startsWith(prefix),
  );

  const [first, ...others] = matches;

  if (!first) {
    return `这个 workspace 没有 id 以 ${prefix} 开头的会话。用 -r 或 /resume 查看列表。`;
  }

  if (others.length > 0) {
    return `有 ${matches.length} 个会话的 id 以 ${prefix} 开头，请多写几位。`;
  }

  return first;
}


/** 恢复 writer、完整消息和 checkpoint */
function resumeSessionFile(
  path: string,
): { writer: SessionWriter; restored: RebuiltSession } {
  const loaded = loadSession(path);

  if (loaded.skippedLines > 0) {
    console.warn(
      `⚠ 会话文件里有 ${loaded.skippedLines} 行无法解析，已跳过（通常是进程被强制结束时写到一半的记录）：${path}`,
    );
  }

  return {
    writer: createSessionWriter({
      path,
      header: loaded.header,
      entries: loaded.entries,
    }),
    restored: rebuildSession(loaded.entries),
  };
}

/** 按 -c / --session / -r 找到要继续的会话；都没有就返回 undefined（新会话） */
async function chooseSessionPath(): Promise<string | undefined> {
  const dir = getSessionDir(workspaceRoot);

  if (values.continue) {
    return findMostRecentSession(dir);
  }

  if (values.session !== undefined) {
    const match = matchSessionPrefix(
      listSessions(dir),
      values.session,
    );

    if (typeof match === "string") {
      fail(match);
    }

    return match.path;
  }

  if (values.resume) {
    const sessions = listSessions(dir);

    if (sessions.length === 0) {
      fail("这个 workspace 还没有会话记录。");
    }

    if (!process.stdin.isTTY) {
      fail(
        "-r 需要在交互式终端里使用；也可以用 --session <id> 指定会话。",
      );
    }

    const picked = await pickSession(sessions);

    if (!picked) {
      console.log("已取消。");
      process.exit(0);
    }

    return picked;
  }

  return undefined;
}


async function openSession(): Promise<{
  writer: SessionWriter;
  restored?: RebuiltSession;
}> {
  const path = await chooseSessionPath();

  if (path) {
    try {
      return resumeSessionFile(path);
    } catch (error) {
      fail(
        `无法继续会话 ${path}：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (values.continue) {
    console.warn("这个 workspace 还没有会话记录，开始新会话。\n");
  }

  return {
    writer: createSessionWriter(newSessionFile(workspaceRoot)),
  };
}


const {
  writer: initialWriter,
  restored,
} = await openSession();


// ---------- Ctrl+C ----------
// 任务运行中：第一次中止当前任务（交互模式回到提示符），第二次强制退出。
// 在提示符或选择菜单里时，Ctrl+C 由 readline 接收，不会走到这里。

let interrupted = false;

/** 中止 /compact 这类在 Agent 任务之外发起的模型请求。 */
let commandAbort: AbortController | undefined;

function handleInterrupt(): void {
  if (interrupted) {
    process.exit(130);
  }

  interrupted = true;

  console.error(
    "\n[中止] 正在停止当前任务和正在运行的命令（再按一次 Ctrl+C 强制退出）",
  );

  agent.abort();
  commandAbort?.abort();
}

process.on("SIGINT", handleInterrupt);


// ---------- 命令确认 ----------

async function askInTerminal(
  command: string,
): Promise<boolean> {
  // 非交互环境没人能回答：一律拒绝
  if (!process.stdin.isTTY) {
    return false;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // 询问期间 Ctrl+C 由 readline 接收：转成中止，并当作拒绝
  rl.on("SIGINT", () => {
    rl.close();
    handleInterrupt();
  });

  const closed = new Promise<string>((resolvePromise) => {
    rl.once("close", () => resolvePromise(""));
  });

  try {
    const answer = await Promise.race([
      rl
        .question(`\n⚠ Agent 想执行：${command}\n允许吗？[y/N] `)
        .catch(() => ""),
      closed,
    ]);

    return answer.trim().toLowerCase() === "y";
  } finally {
    // 每次问完就 close，否则 stdin 一直打开，进程无法退出
    rl.close();
  }
}


// ---------- 统计 ----------

type UsageStats = {
  modelCalls: number;
  tools: string[];
  input: number;
  cached: number;
  output: number;
  peakInput: number;
  compactions: number;
  compactionInput: number;
  compactionOutput: number;
  subtasks: number;
  subtaskInput: number;
  subtaskOutput: number;
};


function emptyStats(): UsageStats {
  return {
    modelCalls: 0,
    tools: [],
    input: 0,
    cached: 0,
    output: 0,
    peakInput: 0,
    compactions: 0,
    compactionInput: 0,
    compactionOutput: 0,
    subtasks: 0,
    subtaskInput: 0,
    subtaskOutput: 0,
  };
}


function addStats(
  into: UsageStats,
  from: UsageStats,
): void {
  into.modelCalls += from.modelCalls;
  into.tools.push(...from.tools);
  into.input += from.input;
  into.cached += from.cached;
  into.output += from.output;
  into.peakInput = Math.max(into.peakInput, from.peakInput);
  into.compactions += from.compactions;
  into.compactionInput += from.compactionInput;
  into.compactionOutput += from.compactionOutput;
  into.subtasks += from.subtasks;
  into.subtaskInput += from.subtaskInput;
  into.subtaskOutput += from.subtaskOutput;
}


function printTokens(
  stats: UsageStats,
  scope: string,
): void {
  if (stats.input > 0) {
    console.log(`Token 用量（主任务${scope}）：`, {
      input: stats.input,
      cachedInput: stats.cached,
      output: stats.output,
      peakInput: stats.peakInput,
    });
  }

  if (stats.compactions > 0) {
    console.log(`Token 用量（压缩${scope}）：`, {
      calls: stats.compactions,
      input: stats.compactionInput,
      output: stats.compactionOutput,
    });
  }
  if (stats.subtasks > 0) {
    console.log(`Token 用量（子任务${scope}）：`, {
      calls: stats.subtasks,
      input: stats.subtaskInput,
      output: stats.subtaskOutput,
    });
  }

  if (
    stats.input > 0
    || stats.compactions > 0
    || stats.subtasks > 0
  ) {
    console.log(`Token 合计${scope}：`, {
      input:
        stats.input
        + stats.compactionInput
        + stats.subtaskInput,

      output:
        stats.output
        + stats.compactionOutput
        + stats.subtaskOutput,
    });
  }
}


/** 当前任务的统计；每个任务开始时清零 */
let current = emptyStats();

/** 整个进程（交互模式下所有任务）的统计 */
const total = emptyStats();

let taskCount = 0;


// ---------- 模型与压缩 ----------

const model = {
  id: modelId,
  provider: "openai-compatible",
  name: modelId,
  contextWindow,
  maxTokens: 4096,
};

// 主任务用的 streamFn
const streamFn = createOpenAICompatibleStreamFn({
  apiKey,
  baseUrl,
  ...(thinking !== undefined
    ? { extraBody: { thinking: { type: thinking } } }
    : {}),
});

// 压缩总结不开 thinking：总结是按模板整理已有内容，用不上推理，开了只会更慢、更贵；
// 思考 token 还计入输出，可能挤占总结的输出上限，让总结更容易被截断。
const summaryStreamFn =
  thinking === "enabled"
    ? createOpenAICompatibleStreamFn({
        apiKey,
        baseUrl,
        extraBody: { thinking: { type: "disabled" } },
      })
    : streamFn;

// ---------- 当前会话 ----------
// 会话文件和压缩状态属于同一个会话：/new（以后还有 /resume）换会话时一起换。

type ActiveSession = {
  writer: SessionWriter;
  compactor: Compactor;

  /** 当前任务的 user 消息条目 id：这个任务里的文件变化都记在它名下 */
  taskEntryId: string | undefined;
};


function createActiveSession(
  writer: SessionWriter,
  checkpoint?: CompactionCheckpoint,
): ActiveSession {
  // 总结调用不经过 Agent Loop；Budget 不计算总结调用，token 单独统计。
  const compactor = createCompactor({
    model,
    streamFn: summaryStreamFn,
    settings: compactionSettings,

    // 继续会话：从上次的压缩状态接着来
    initialCheckpoint: checkpoint,

    onEstimate(tokens, threshold) {
      console.log(`[context] est=${tokens} threshold=${threshold}`);
    },

    onCompaction(event) {
      current.compactions += 1;
      current.compactionInput += event.usage?.input ?? 0;
      current.compactionOutput += event.usage?.output ?? 0;

      console.log(
        [
          `\n[compaction #${total.compactions + current.compactions}]`,
          `est ${event.tokensBefore} → ~${event.estimatedTokensAfter}`,
          `summarized=${event.summarizedMessages}`,
          `kept=${event.keptMessages}`,
          ...(event.usage
            ? [
                `summary in=${event.usage.input} out=${event.usage.output}`
                + (event.usage.reasoning !== undefined ? ` reasoning=${event.usage.reasoning}` : ""),
              ]
            : []),
          ...(event.attempts > 1
            ? [`attempts=${event.attempts}（首次被截断，in/out 含两次）`]
            : []),
        ].join(" "),
      );

      console.log(
        `----- summary -----\n${event.summary}\n-------------------\n`,
      );

      // 写进这个压缩器所属会话的文件（闭包里的 writer，不是 active.writer）。
      // 写入失败不中断任务：恢复时没有这条记录，会退回到完整 transcript
      try {
        writer.appendCompaction(event.checkpoint, {
          tokensBefore: event.tokensBefore,
          ...(event.usage ? { usage: event.usage } : {}),
        });
      } catch (error) {
        console.error(
          `[session] 压缩记录写入失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },

    onError(error) {
      console.error(
        `\n[compaction failed] ${error instanceof Error ? error.message : String(error)}（本次不压缩，继续运行）\n`,
      );
    },
  });

  return { writer, compactor, taskEntryId: undefined };
}


let active = createActiveSession(initialWriter, restored?.checkpoint);


// ---------- 检查点 ----------
// 写工具通过安全检查后调用：改动前后的内容记进当前会话，/undo 用。

const trackWrite: WriteTracker = <T>(
  target: WriteTarget,
  write: () => Promise<T>,
): Promise<T> => {
  const taskEntryId = active.taskEntryId;

  // 工具只会在任务里被调用；万一不在任务里，照常写，只是不能撤销
  if (taskEntryId === undefined) {
    return write();
  }

  return captureFileChange({
    absolutePath: target.absolutePath,
    path: target.relativePath,
    toolCallId: target.toolCallId,
    write,
    record: (change) => {
      active.writer.appendFileChange({ taskEntryId, ...change });
    },
    onRecordError: (error) => {
      console.error(
        `[checkpoint] ${target.relativePath} 的修改没有记录下来，无法撤销：${error instanceof Error ? error.message : String(error)}`,
      );
    },
  });
};


// ---------- Agent ----------

const budget = createBudgetExtension({
  maxModelCalls: 50,
  maxToolCalls: 120,
});

// 子 Agent 只获得只读工具，预算按子任务独立创建。
const taskTool = createTaskTool({
  model,
  streamFn,

  systemPrompt:
    createSubagentSystemPrompt(workspaceRoot),

  tools: [
    createListDirectoryTool(workspaceRoot),
    createReadFileTool(workspaceRoot),
    createSearchTextTool(workspaceRoot),
  ],

  createExtensions: () => [
    createBudgetExtension({
      maxModelCalls: 20,
      maxToolCalls: 60,
    }),

    createLoggerExtension(
      (line) => console.log(`  [task] ${line}`),
    ),
  ],
});

const agent = new Agent({
  initialState: {
    model,

    // 继续会话时是完整 transcript；发给模型的视图由压缩器生成
    messages: restored?.messages ?? [],

    systemPrompt:
      createCodingSystemPrompt(workspaceRoot, { sandbox }),

    tools: [
      createListDirectoryTool(workspaceRoot),
      createReadFileTool(workspaceRoot),
      createSearchTextTool(workspaceRoot),
      createWriteFileTool(workspaceRoot, { track: trackWrite }),
      createEditFileTool(workspaceRoot, { track: trackWrite }),
      createRunCommandTool(workspaceRoot, { executor: commandExecutor }),
      taskTool,
    ],
  },

  loopConfig: {
    convertToLlm: sanitizeForLlm,

    transformContext: (messages, signal) =>
      active.compactor.transformContext(messages, signal),

    extensions: [
      budget,
      createCommandApprovalExtension({
        approve: askInTerminal,
      }),
      createLoggerExtension(),
    ],
  },

  streamFn,
});


agent.subscribe((event) => {
  // 只写完整消息；流式中的 partial 不写
  if (event.type === "message_end") {
    const entryId = active.writer.appendMessage(event.message);

    // 任务从 user 消息开始：之后的文件变化都记在这个任务名下
    if (event.message.role === "user") {
      active.taskEntryId = entryId;
    }
  }

  if (event.type === "tool_execution_start") {
    current.tools.push(event.toolName);
  }
  
    // 子 Agent 的消息不经过主 Agent 的订阅回调。
  if (
    event.type === "tool_execution_end"
    && event.toolName === "task"
  ) {
    const details =
      (event.result as { details?: TaskDetails }).details;

    if (details) {
      current.subtasks += 1;
      current.subtaskInput += details.usage.input;
      current.subtaskOutput += details.usage.output;

      console.log(
        `  [task] ${event.isError ? "failed" : "done"}: ${details.description}（模型 ${details.modelCalls} 次，工具 ${details.toolCalls} 次，in=${details.usage.input} out=${details.usage.output}）`,
      );
    }
  }

  if (
    event.type === "tool_execution_end"
    && event.toolName === "run_command"
  ) {
    const result =
      event.result as { content?: TextContent[] };

    const text = result.content
      ?.map((item) => item.text)
      .join("") ?? "";

    console.log(
      `\n----- run_command output -----\n${text}\n------------------------------\n`,
    );
  }

  if (
    event.type === "message_end"
    && event.message.role === "assistant"
  ) {
    current.modelCalls += 1;

    // 中止不算错误：结尾会打印「已中止」
    if (
      event.message.stopReason === "error"
      && event.message.errorMessage
    ) {
      console.error(`\n[model error] ${event.message.errorMessage}\n`);
    }

    const usage = event.message.usage;

    if (usage) {
      current.input += usage.input;
      current.cached += usage.cacheRead ?? 0;
      current.output += usage.output;
      current.peakInput = Math.max(current.peakInput, usage.input);
    }

    // 思考过程可能很长，只打印长度
    const thinkingChars = event.message.content.reduce(
      (sum, item) =>
        item.type === "thinking" ? sum + item.thinking.length : sum,
      0,
    );

    if (thinkingChars > 0) {
      console.log(`[thinking] ${thinkingChars} 字符`);
    }

    const text = event.message.content
      .filter(
        (item): item is TextContent =>
          item.type === "text",
      )
      .map((item) => item.text)
      .join("");

    if (text.length > 0) {
      console.log(`\n[assistant] ${text}\n`);
    }
  }
});


// ---------- 运行 ----------

async function runTask(
  task: string,
): Promise<void> {
  budget.reset();
  current = emptyStats();
  interrupted = false;

  // 上次 /undo 之后还没告诉过模型：把说明作为单独一条消息，放在这次输入前面
  const note = existsSync(active.writer.path)
    ? createUndoNote(unannouncedUndos(loadSession(active.writer.path).entries))
    : undefined;

  if (note) {
    console.log("（已在这次任务前告诉模型：之前的修改被撤销了）");
  }

  try {
    await agent.prompt(
      note
        ? [note, { role: "user", content: task, timestamp: Date.now() }]
        : task,
    );
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      console.error(`\n[stopped] ${error.message}`);
    } else {
      // 意外错误：打印出来；交互模式里还可以接着输入下一个任务
      console.error(
        `\n[error] ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
  }

  if (interrupted) {
    console.log("\n已中止。");
  }

  console.log("\n模型调用次数：", current.modelCalls);
  console.log("执行过的工具：", current.tools);
  printTokens(current, "");

  addStats(total, current);
  taskCount += 1;
}

// ---------- 交互模式命令 ----------

type ReplAction = "continue" | "exit";

type ReplCommand = {
  /** 第一个是主名称，其余是别名 */
  names: string[];

  usage?: string;
  description: string;

  run(args: string): ReplAction | Promise<ReplAction>;
};

function printPreviousSession(
  previous: SessionWriter,
): void {
  if (!existsSync(previous.path)) {
    return;
  }

  const id = previous.id.slice(0, 8);

  console.log(`上一个会话：${previous.path}`);

  console.log(
    `回到它：/resume ${id}（或退出后 ts-coding-agent --session ${id}）`,
  );
}


function printLastUserMessage(
  messages: AgentMessage[],
): void {
  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  if (lastUser?.role === "user") {
    console.log(
      `上次的最后一条：${oneLine(textOf(lastUser.content))}`,
    );
  }
}


const replCommands: ReplCommand[] = [
  {
    names: ["/help"],
    description: "显示这份命令列表",
    run() {
      printReplHelp();
      return "continue";
    },
  },
  {
    names: ["/new"],
    description: "结束当前会话，开始一个新会话",
    run() {
      const previous = active.writer;

      agent.reset();
      active = createActiveSession(
        createSessionWriter(newSessionFile(workspaceRoot)),
      );

      console.log("\n已开始新会话（写入第一条消息时才创建文件）。");

      printPreviousSession(previous);

      return "continue";
    },
  },
  {
    names: ["/resume"],
    usage: "[id前缀]",
    description: "切换到这个 workspace 的另一个会话（不写 id 就从列表里选）",

    async run(args): Promise<ReplAction> {
      const sessions =
        listSessions(getSessionDir(workspaceRoot));

      let path: string | undefined;

      if (args.length > 0) {
        const match = matchSessionPrefix(sessions, args);

        if (typeof match === "string") {
          console.log(match);
          return "continue";
        }

        path = match.path;
      } else {
        const others = sessions.filter(
          (session) => session.path !== active.writer.path,
        );

        if (others.length === 0) {
          console.log("没有其他会话可以切换。");
          return "continue";
        }

        path = await pickSession(others);

        if (!path) {
          console.log("已取消。");
          return "continue";
        }
      }

      if (path === active.writer.path) {
        console.log("已经在这个会话里了。");
        return "continue";
      }

      let next:
        ReturnType<typeof resumeSessionFile> | undefined;

      try {
        next = resumeSessionFile(path);
      } catch (error) {
        console.log(
          `无法打开会话 ${path}：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      if (!next) {
        return "continue";
      }

      const previous = active.writer;

      agent.reset();
      agent.state.messages = next.restored.messages.slice();

      active = createActiveSession(
        next.writer,
        next.restored.checkpoint,
      );

      console.log(
        `\n已切换到会话：${next.writer.path}（${next.restored.messages.length} 条消息${next.restored.checkpoint ? "，已压缩过" : ""}）`,
      );

      printPreviousSession(previous);
      printLastUserMessage(next.restored.messages);

      return "continue";
    },
  },
  {
    names: ["/compact"],
    usage: "[额外要求]",
    description: "立即压缩当前会话的上下文，可以附带对总结的要求",

    async run(args): Promise<ReplAction> {
      const messages = agent.state.messages;

      if (messages.length === 0) {
        console.log("当前会话还没有消息，无需压缩。");
        return "continue";
      }

      // 手动总结单独统计，并允许 Ctrl+C 中止。
      current = emptyStats();
      interrupted = false;
      commandAbort = new AbortController();

      const outcome = await active.compactor
        .compact(messages, {
          signal: commandAbort.signal,
          customInstructions:
            args.length > 0 ? args : undefined,
        })
        .finally(() => {
          commandAbort = undefined;
        });

      if (outcome.status === "nothing") {
        console.log(
          `没有可以压缩的内容：保留区（最近约 ${compactionSettings.keepRecentTokens} tokens）之外没有消息。`,
        );
      } else if (
        outcome.status === "failed"
        && interrupted
      ) {
        console.log("已中止。");
      }

      // 计入整个进程的 Token 合计，但不增加任务数。
      printTokens(current, "");
      addStats(total, current);
      current = emptyStats();
      interrupted = false;

      return "continue";
    },
  },
  {
    names: ["/session"],
    description: "显示当前会话的文件、消息数和上下文大小",
    run() {
      const messages = agent.state.messages;
      const context = active.compactor.inspect(messages);
      const percent = Math.round(
        (context.estimatedTokens / context.threshold) * 100,
      );

      console.log(
        `\n会话文件：${active.writer.path}${existsSync(active.writer.path) ? "" : "（还没有消息，文件尚未创建）"}`,
      );
      console.log(`会话 id：${active.writer.id}`);
      console.log(
        `消息：${messages.length} 条${context.compacted ? `，已压缩；发给模型的视图约 ${context.viewMessages} 条` : ""}`,
      );
      console.log(
        `上下文：估算约 ${context.estimatedTokens} tokens，压缩阈值 ${context.threshold}（${percent}%）`,
      );
      console.log(
        `本次运行：${taskCount} 个任务，input ${total.input + total.compactionInput + total.subtaskInput}，output ${total.output + total.compactionOutput + total.subtaskOutput}`,
      );

      return "continue";
    },
  },
  {
    names: ["/undo"],
    description: "撤销最近一个任务对文件的修改（只跟踪 write_file / edit_file）",
    async run(): Promise<ReplAction> {
      const plan = existsSync(active.writer.path)
        ? planUndo(loadSession(active.writer.path).entries)
        : undefined;

      if (!plan) {
        console.log("没有可以撤销的修改（只跟踪 write_file / edit_file 的改动）。");
        return "continue";
      }

      const conflicts = new Set(await findConflicts(workspaceRoot, plan));

      console.log(`\n将撤销任务「${oneLine(plan.taskText)}」对以下文件的修改：`);

      for (const file of plan.files) {
        const action = file.before === null
          ? "删除（这个任务新建的）"
          : "恢复到任务开始前";

        const warning = conflicts.has(file.path)
          ? "  ⚠ 任务之后又被改过，恢复会覆盖这些改动"
          : "";

        console.log(`  ${file.path}  ${action}${warning}`);
      }

      console.log("对话记录不会改变；run_command 造成的改动不在其中。");

      const answer = await promptLine("确认撤销吗？[y/N] ");

      if (answer?.trim().toLowerCase() !== "y") {
        console.log("已取消。");
        return "continue";
      }

      // 用户看提示的这段时间里，文件可能又被改了：出现新冲突就停下，不覆盖
      const changed = await findNewConflicts(workspaceRoot, plan, conflicts);

      if (changed.length > 0) {
        console.log("确认期间这些文件又被改过，为避免覆盖，这次没有撤销：");

        for (const path of changed) {
          console.log(`  ${path}`);
        }

        console.log("检查之后可以重新执行 /undo。");
        return "continue";
      }

      const failures = await applyUndo(workspaceRoot, plan);

      if (failures.length > 0) {
        for (const failure of failures) {
          console.log(
            `  恢复失败：${failure.path}：${failure.error instanceof Error ? failure.error.message : String(failure.error)}`,
          );
        }

        console.log("有文件没有恢复成功，这次不记为已撤销；处理好之后可以再执行一次 /undo。");
        return "continue";
      }

      active.writer.appendUndo({
        taskEntryId: plan.taskEntryId,
        files: plan.files.map((file) => file.path),
      });

      console.log(`已撤销 ${plan.files.length} 个文件。再执行 /undo 会继续撤销更早的任务。`);

      return "continue";
    },
  },
  {
    names: ["/exit", "/quit"],
    description: "退出（在提示符处按 Ctrl+C 或 Ctrl+D 也可以）",
    run() {
      return "exit";
    },
  },
];


function findReplCommand(
  name: string,
): ReplCommand | undefined {
  return replCommands.find(
    (command) => command.names.includes(name),
  );
}


function printReplHelp(): void {
  const rows = replCommands.map((command) => ({
    name: [command.names.join(", "), command.usage]
      .filter(Boolean)
      .join(" "),
    description: command.description,
  }));

  const width = Math.max(
    ...rows.map((row) => row.name.length),
  );

  console.log("\n命令：");

  for (const row of rows) {
    console.log(
      `  ${row.name.padEnd(width)}  ${row.description}`,
    );
  }

  console.log(
    "\n其他非 / 开头的输入都作为任务发给 Agent。空行忽略；任务运行中按 Ctrl+C 只中止当前任务，连按两次强制退出。",
  );
}


async function runRepl(): Promise<void> {
  console.log(
    "\n交互模式：输入任务后回车运行；/help 查看命令，/exit、Ctrl+C 或 Ctrl+D 退出。任务运行中按 Ctrl+C 只中止当前任务。",
  );

  // 继续会话时，先让用户确认接的是哪个会话
  printLastUserMessage(restored?.messages ?? []);

  while (true) {
    const line = await promptLine("\n> ");

    // Ctrl+C / Ctrl+D
    if (line === null) {
      break;
    }

    const input = line.trim();

    // 误按回车：不退出
    if (input.length === 0) {
      continue;
    }

    if (input.startsWith("/")) {
      const name =
        (input.split(/\s+/, 1)[0] ?? "").toLowerCase();

      const args = input.slice(name.length).trim();
      const command = findReplCommand(name);

      if (!command) {
        console.log(
          `未知命令：${name}。输入 /help 查看可用命令。`,
        );
        continue;
      }

      try {
        if ((await command.run(args)) === "exit") {
          break;
        }
      } catch (error) {
        console.error(
          `[error] ${name}：${error instanceof Error ? error.message : String(error)}`,
        );
      }

      continue;
    }

    await runTask(input);
  }

  if (taskCount > 1) {
    console.log(`\n本次共 ${taskCount} 个任务：`);
    printTokens(total, "，全部任务");
  }
}


console.log("workspace:", workspaceRoot);
console.log("model:", modelId);
console.log("thinking:", thinking ?? "(provider default)");
console.log("sandbox:", sandboxLabel);
console.log(
  "session:",
  restored
    ? `继续 ${active.writer.path}（${restored.messages.length} 条消息${restored.checkpoint ? "，已压缩过" : ""}）`
    : active.writer.path,
);
console.log(
  `context: window=${compactionSettings.contextWindow} reserve=${compactionSettings.reserveTokens} keepRecent=${compactionSettings.keepRecentTokens}`,
);

if (interactive) {
  await runRepl();
} else {
  console.log("task:", argTask, "\n");
  await runTask(argTask);

  if (interrupted) {
    process.exitCode = 130;
  }
}

// 新会话里一个任务都没跑的话，文件还没创建
if (existsSync(active.writer.path)) {
  console.log(`\n会话记录：${active.writer.path}`);
  console.log("继续这个会话：ts-coding-agent -c");
}

console.log(
  "\n请检查改动：git diff；满意再 commit，不满意用 git restore . 回滚。",
);
