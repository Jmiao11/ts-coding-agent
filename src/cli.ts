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


const DEFAULT_ENV_FILE =
  join(homedir(), ".agent-harness.env");

const HELP = `用法：agent-harness [选项] "任务描述"

在 Git 仓库里运行 coding agent。改动不会自动提交，请用 git diff 审查。

选项：
  -w, --workspace <dir>   工作目录（默认：当前目录；必须在 Git 仓库里）
  -m, --model <id>        模型 ID（默认：AGENT_MODEL）
      --env-file <path>   API 配置文件（默认：${DEFAULT_ENV_FILE}）
  -h, --help              显示帮助

需要的配置（环境变量，或写在 env 文件里）：
  AGENT_API_KEY  AGENT_BASE_URL  AGENT_MODEL

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
      // 选项名里有连字符，所以必须加引号
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

const task = positionals.join(" ").trim();

if (task.length === 0) {
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

const agent = new Agent({
  initialState: {
    model: {
      id: modelId,
      provider: "openai-compatible",
      name: modelId,
      contextWindow: 128_000,
      maxTokens: 4096,
    },

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
    convertToLlm(messages) {
      return [...messages];
    },

    extensions: [
      createBudgetExtension({
        maxModelCalls: 30,
        maxToolCalls: 50,
      }),
      createCommandApprovalExtension({
        approve: askInTerminal,
      }),
      createLoggerExtension(),
    ],
  },

  streamFn: createOpenAICompatibleStreamFn({
    apiKey,
    baseUrl,
  }),
});


const executedTools: string[] = [];
let modelCallCount = 0;
let totalInput = 0;
let totalCached = 0;
let totalOutput = 0;
let peakInput = 0;

agent.subscribe((event) => {
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
  console.log("Token 用量：", {
    input: totalInput,
    cachedInput: totalCached,
    output: totalOutput,
    peakInput,
  });
}

console.log(
  "\n请检查改动：git diff；满意再 commit，不满意用 git restore . 回滚。",
);

process.exitCode = interrupted ? 130 : 0;
