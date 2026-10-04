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

import type {
  TextContent,
} from "./ai/types.js";

import {
  createOpenAICompatibleStreamFn,
} from "./ai/providers/openai-compatible.js";

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
} from "./prompts/coding-system-prompt.js";

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
  createSearchTextTool,
} from "./tools/search-text.js";

import {
  createWriteFileTool,
} from "./tools/write-file.js";

import {
  createCompactor,
} from "./context/compaction.js";

import {
  createSessionWriter,
  findMostRecentSession,
  getSessionDir,
  loadSession,
  listSessions,
  newSessionFile,
  rebuildSession,
  type RebuiltSession,
  type SessionWriter,
  type SessionSummary,
} from "./session/session-store.js";

import {
  sanitizeForLlm,
} from "./session/sanitize-for-llm.js";

import {
  textOf,
} from "./context/token-estimate.js";

const DEFAULT_ENV_FILE =
  join(homedir(), ".agent-harness.env");

const HELP = `用法：agent-harness [选项] "任务描述"
继续会话（-c / -r / --session）时可以不写任务描述，选好会话后再输入。

在 Git 仓库里运行 coding agent。改动不会自动提交，请用 git diff 审查。

选项：
  -w, --workspace <dir>   工作目录（默认：当前目录；必须在 Git 仓库里）
  -m, --model <id>        模型 ID（默认：AGENT_MODEL）
      --env-file <path>   API 配置文件（默认：${DEFAULT_ENV_FILE}）
      --context-window <n>  工作预算，超过就压缩（默认 128000，不是模型上限；调小可用来测试压缩）
  -h, --help              显示帮助
  
  -c, --continue          继续这个 workspace 最近的会话（任务描述作为追问）
  -r, --resume            从这个 workspace 的会话列表里选一个继续
      --session <id>      按 id 前缀继续指定的会话（-r 列表里显示的 8 位）

需要的配置（环境变量，或写在 env 文件里）：
  AGENT_API_KEY  AGENT_BASE_URL  AGENT_MODEL
  可选：AGENT_THINKING=disabled（DeepSeek：显式关闭 thinking）

运行中按 Ctrl+C 中止；再按一次强制退出。`;


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
      workspace: { type: "string", short: "w" },
      model: { type: "string", short: "m" },
      "env-file": { type: "string" },
      "context-window": { type: "string" },
      // 选项名里有连字符，所以必须加引号

      continue: { type: "boolean", short: "c" },
      resume: { type: "boolean", short: "r" },
      session: { type: "string" },

    },
  });
}
// positionals 放"没名字的普通参数"。

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

// 继续会话时可以不写任务描述：选好会话后再输入。
const argTask = positionals.join(" ").trim();

if (argTask.length === 0 && sessionModes === 0) {
  fail(HELP);
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

// DeepSeek 默认开启 thinking；开启时带 tools 的请求必须回传每轮的 reasoning_content，
// 我们还不支持，所以目前只允许显式关闭。不设置就什么都不发（其他 Provider 可能不认识这个字段）。
const thinking = process.env.AGENT_THINKING || undefined;

if (thinking !== undefined && thinking !== "disabled") {
  fail(
    `AGENT_THINKING 目前只支持 disabled（收到：${thinking}）。开启 thinking 需要先支持回传 reasoning_content。`,
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


// ---------- Session ----------

const MAX_LISTED_SESSIONS = 20;


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


/** Agent 创建之前读一行输入：Ctrl+C 直接退出 */
async function promptLine(
  question: string,
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("SIGINT", () => {
    rl.close();
    console.log("\n已取消。");
    process.exit(130);
  });

  const closed = new Promise<string>((resolvePromise) => {
    rl.once("close", () => resolvePromise(""));
  });

  try {
    return await Promise.race([
      rl.question(question).catch(() => ""),
      closed,
    ]);
  } finally {
    rl.close();
  }
}


async function pickSession(
  sessions: SessionSummary[],
): Promise<string> {
  if (sessions.length === 0) {
    fail("这个 workspace 还没有会话记录。");
  }

  if (!process.stdin.isTTY) {
    fail("-r 需要在交互式终端里使用；也可以用 --session <id> 指定会话。");
  }

  const shown = sessions.slice(0, MAX_LISTED_SESSIONS);

  console.log(`\n${workspaceRoot} 的会话（最近活动的在前）：\n`);

  shown.forEach((session, index) => {
    console.log(
      `[${index + 1}] ${formatTime(session.modified)}  ${session.id.slice(0, 8)}  ${session.messageCount} 条消息${session.compacted ? "，已压缩" : ""}`,
    );
    console.log(`    首条：${oneLine(session.firstUserText)}`);

    if (session.lastUserText !== session.firstUserText) {
      console.log(`    最后：${oneLine(session.lastUserText)}`);
    }
  });

  if (sessions.length > shown.length) {
    console.log(
      `\n（还有 ${sessions.length - shown.length} 个更早的会话没有列出，可以用 --session <id> 指定）`,
    );
  }

  const answer = await promptLine("\n继续哪一个？输入编号（直接回车取消）：");

  const choice = Number(answer.trim());
  const picked = Number.isInteger(choice) ? shown[choice - 1] : undefined;

  if (!picked) {
    console.log("已取消。");
    process.exit(0);
  }

  return picked.path;
}


/** 按 -c / --session / -r 找到要继续的会话；都没有就返回 undefined（新会话） */
async function chooseSessionPath(): Promise<string | undefined> {
  const dir = getSessionDir(workspaceRoot);

  if (values.continue) {
    return findMostRecentSession(dir);
  }

  if (values.session !== undefined) {
    const prefix = values.session;

    const matches = listSessions(dir).filter(
      (session) => session.id.startsWith(prefix),
    );

    if (matches.length === 0) {
      fail(`这个 workspace 没有 id 以 ${prefix} 开头的会话。用 -r 查看列表。`);
    }

    if (matches.length > 1) {
      fail(`有 ${matches.length} 个会话的 id 以 ${prefix} 开头，请多写几位。`);
    }

    return matches[0]?.path;
  }

  if (values.resume) {
    return pickSession(listSessions(dir));
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
      const loaded = loadSession(path);

      return {
        writer: createSessionWriter({
          path,
          header: loaded.header,
          entries: loaded.entries,
        }),
        restored: rebuildSession(loaded.entries),
      };
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
  writer: sessionWriter,
  restored,
} = await openSession();


async function askForTask(): Promise<string> {
  if (!process.stdin.isTTY) {
    fail("缺少任务描述：非交互环境里请把任务写在命令里。");
  }

  const lastUser = [...(restored?.messages ?? [])]
    .reverse()
    .find((message) => message.role === "user");

  if (lastUser?.role === "user") {
    console.log(`\n上次的最后一条：${oneLine(textOf(lastUser.content))}`);
  }

  const answer = (
    await promptLine(
      restored
        ? "追问（直接回车取消）："
        : "任务（直接回车取消）：",
    )
  ).trim();

  if (answer.length === 0) {
    console.log("已取消。");
    process.exit(0);
  }

  return answer;
}


const task =
  argTask.length > 0
    ? argTask
    : await askForTask();


// ---------- Ctrl+C ----------

let interrupted = false;

function handleInterrupt(): void {
  if (interrupted) {
    process.exit(130);
  }

  interrupted = true;

  console.error(
    "\n[中止] 正在停止 Agent 和正在运行的命令（再按一次 Ctrl+C 强制退出）",
  );

  agent.abort();
}

process.on("SIGINT", handleInterrupt);
// 当前进程收到 SIGINT
// ↓
// 调用 handleInterrupt


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


// ---------- Agent ----------

// ---------- 模型与压缩 ----------

const model = {
  id: modelId,
  provider: "openai-compatible",
  name: modelId,
  contextWindow,
  maxTokens: 4096,
};

// 主任务和压缩总结用同一个 streamFn
const streamFn = createOpenAICompatibleStreamFn({
  apiKey,
  baseUrl,
  ...(thinking === "disabled"
    ? { extraBody: { thinking: { type: "disabled" } } }
    : {}),
});

// 总结调用不经过 Agent Loop；Budget 不计算总结调用，token 单独统计。
let compactionCount = 0;
let compactionInput = 0;
let compactionOutput = 0;

const compactor = createCompactor({
  model,
  streamFn,
  settings: compactionSettings,
  initialCheckpoint: restored?.checkpoint,

  onEstimate(tokens, threshold) {
    console.log(`[context] est=${tokens} threshold=${threshold}`);
  },

  onCompaction(event) {
    compactionCount += 1;
    compactionInput += event.usage?.input ?? 0;
    compactionOutput += event.usage?.output ?? 0;

    console.log(
      [
        `\n[compaction #${compactionCount}]`,
        `est ${event.tokensBefore} → ~${event.estimatedTokensAfter}`,
        `summarized=${event.summarizedMessages}`,
        `kept=${event.keptMessages}`,
        ...(event.usage
          ? [`summary in=${event.usage.input} out=${event.usage.output}`]
          : []),
        ...(event.attempts > 1
          ? [`attempts=${event.attempts}（首次被截断，in/out 含两次）`]
          : []),
      ].join(" "),
    );

    console.log(
      `----- summary -----\n${event.summary}\n-------------------\n`,
    );

    try {
      sessionWriter.appendCompaction(event.checkpoint, {
        tokensBefore: event.tokensBefore,
        ...(event.usage ? { usage: event.usage } : {}),
      });
    } catch (error) {
      console.error(
        `[session] 压缩记录写入失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  },

  onError(error) {
    console.error(
      `\n[compaction failed] ${error instanceof Error ? error.message : String(error)}（本次不压缩，继续运行）\n`,
    );
  },
});

const agent = new Agent({
  initialState: {
    model,
    messages: restored?.messages ?? [],

    systemPrompt:
      createCodingSystemPrompt(workspaceRoot),

    tools: [
      createListDirectoryTool(workspaceRoot),
      createReadFileTool(workspaceRoot),
      createSearchTextTool(workspaceRoot),
      createWriteFileTool(workspaceRoot),
      createEditFileTool(workspaceRoot),
      createRunCommandTool(workspaceRoot),
    ],
  },

  loopConfig: {
    convertToLlm: sanitizeForLlm,

    transformContext: (messages, signal) =>
      compactor.transformContext(messages, signal),

    extensions: [
      createBudgetExtension({
        maxModelCalls: 50,
        maxToolCalls: 120,
      }),
      createCommandApprovalExtension({
        approve: askInTerminal,
      }),
      createLoggerExtension(),
    ],
  },

  streamFn,
});


const executedTools: string[] = [];
let modelCallCount = 0;
let totalInput = 0;
let totalCached = 0;
let totalOutput = 0;
let peakInput = 0;



agent.subscribe((event) => {

  // 保存结束时的消息，不保存流式 partial。
  if (event.type === "message_end") {
    sessionWriter.appendMessage(event.message);
  }

  if (event.type === "tool_execution_start") {
    executedTools.push(event.toolName);
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
    modelCallCount += 1;

    // Provider 错误（HTTP 400 等）的正文在 errorMessage 里，否则终端上看不到
    // 中止不算错误：结尾会打印「已中止」
    if (
      event.message.stopReason === "error"
      && event.message.errorMessage
    ) {
      console.error(`\n[model error] ${event.message.errorMessage}\n`);
    }

    const usage = event.message.usage;

    if (usage) {
      totalInput += usage.input;
      totalCached += usage.cacheRead ?? 0;
      totalOutput += usage.output;
      peakInput = Math.max(peakInput, usage.input);
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


console.log("workspace:", workspaceRoot);
console.log("model:", modelId);
console.log("thinking:", thinking ?? "(provider default)");
console.log(
  "session:",
  restored
    ? `继续 ${sessionWriter.path}（${restored.messages.length} 条消息${restored.checkpoint ? "，已压缩过" : ""}）`
    : sessionWriter.path,
);
console.log(
  `context: window=${compactionSettings.contextWindow} reserve=${compactionSettings.reserveTokens} keepRecent=${compactionSettings.keepRecentTokens}`,
);
console.log("task:", task, "\n");

try {
  await agent.prompt(task);
} catch (error) {
  if (error instanceof BudgetExceededError) {
    console.error(`\n[stopped] ${error.message}`);
  } else {
    throw error;
  }
}

if (interrupted) {
  console.log("\n已中止。");
}

console.log("\n模型调用次数：", modelCallCount);
console.log("执行过的工具：", executedTools);

if (totalInput > 0) {
  console.log("Token 用量（主任务）：", {
    input: totalInput,
    cachedInput: totalCached,
    output: totalOutput,
    peakInput,
  });
}

if (compactionCount > 0) {
  console.log("Token 用量（压缩）：", {
    calls: compactionCount,
    input: compactionInput,
    output: compactionOutput,
  });
}

if (totalInput > 0 || compactionCount > 0) {
  console.log("Token 合计：", {
    input: totalInput + compactionInput,
    output: totalOutput + compactionOutput,
  });
}

console.log(`\n会话记录：${sessionWriter.path}`);
console.log('继续这个会话：agent-harness -c "追问内容"');
console.log(
  "\n请检查改动：git diff；满意再 commit，不满意用 git restore . 回滚。",
);

process.exitCode = interrupted ? 130 : 0;
