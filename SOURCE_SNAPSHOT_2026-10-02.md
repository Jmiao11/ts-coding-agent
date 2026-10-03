# Source Snapshot

## 1. Snapshot 元信息

以下三个命令在当前源码的临时副本中运行，避免 `pnpm build` 写入仓库现有的 `dist/`；`git` 元信息来自创建快照前的仓库。

### 生成时间（带时区）
````text
2026-10-03 10:27:17 +08:00 (Asia/Shanghai)
````

### `git rev-parse --abbrev-ref HEAD`
````text
master
````

### `git log --oneline -30`
````text
cdcffe6 context: hard summary cap (max_tokens) + retry on cut-off; provider: report length; list_directory: workspace-pathaa0d671 context: calibrate token estimate (/3), keep findings in summaries; budget: clearer block, higher limits1e774e6 cli: wire compactor, --context-window, separate compaction usagead67b9d context: compactor (successful-call file tracking, stale-usage test fixed)c9e1b3b context: token estimation + measuring transformContextefa55bd run_command: decode output per line, UTF-8 with GBK fallback2f589a1 feat: edit_file returns the edited region with context (written by agent)0e05a89 refactor: rename tool files to kebab-case (written by agent)19d5212 tools: block .env access; discourage chained commands3d92785 docs: README (written by agent, reviewed and corrected)d8b17f6 cli: agent-harness command, home env file, git guard, Ctrl+C abort3b5e361 chore: add typecheck script (written by agent)0547acd usage: token usage from provider, logged per model callbcf670b test: tool not found keeps the loop running (written by agent)9300cc8 edit_file: match on raw content, support mixed line endings15816ba coding tools + system prompt + real-task runnerd9e08b9 coding tools + system prompt + real-task runner
````

### `git status --short`（创建快照前）
````text
````

### `pnpm test`
````text
✓ Lockfile passes supply-chain policies (verified 10d ago)
Lockfile is up to date, resolution step is skipped
Already up to date

dependencies:
+ typebox 1.3.34

devDependencies:
+ @types/node 26.6.2
+ typescript 7.0.2
+ vitest 5.0.1

Update available! 12.5.1 → 12.8.1.
Changelog: https://pnpm.io/v/12.8.1
To update, run: Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
Done in 1.9s using pnpm v12.5.1
$ vitest run

 RUN  v5.0.1 C:/Users/Jmiao/AppData/Local/Temp/agent-harness-snapshot-fc4c809af51f49669b1dfe63c1a30566

 Test Files  15 passed (15)
      Tests  65 passed (65)
   Start at  10:24:09
   Duration  2.84s (import 60%, transform 22%, tests 17%, worker 1%)
[exit code: 0]
````

默认 reporter 只输出总数；下列逐文件计数由同一源码副本的 Vitest JSON reporter 提取。
````text
✓ tests/agent-loop.test.ts (7 tests)
✓ tests/agent.test.ts (3 tests)
✓ tests/budget.test.ts (1 test)
✓ tests/command-approval.test.ts (2 tests)
✓ tests/compaction.test.ts (8 tests)
✓ tests/edit-file.test.ts (8 tests)
✓ tests/event-stream.test.ts (1 test)
✓ tests/extension-host.test.ts (3 tests)
✓ tests/openai-compatible.test.ts (15 tests)
✓ tests/read-file.test.ts (4 tests)
✓ tests/run-command.test.ts (4 tests)
✓ tests/search-text.test.ts (2 tests)
✓ tests/token-estimate.test.ts (2 tests)
✓ tests/write-file.test.ts (2 tests)
✓ tests/fakes/list-directory.test.ts (3 tests)
 Test Files  15 passed (15)
      Tests  65 passed (65)
````

### `pnpm typecheck`
````text
$ tsc -p tsconfig.json
[exit code: 0]
````

### `pnpm build`
````text
$ tsc -p tsconfig.build.json
[exit code: 0]
````

pnpm-lock.yaml 的 `lockfileVersion` 是 `

## 2. Reality Check

| 项目 | 是/否/内容 | 依据 |
|---|---|---|
| 压缩尝试次数 | **否**：`CompactionEvent` 没有 `attempts` 字段；CLI 没有打印 `attempts=`。 | `src/context/compaction.ts:224-231`；`src/cli.ts:467-472` |
| 总结预算 | **是**：有 `maxSummaryTokens` 与 `maxSummaryOutputTokens`；默认分别为 `floor(0.4 × reserveTokens)` 和 `floor(0.8 × reserveTokens)`；prompt 写入目标预算；输出因 `length` 截断时只重试一次。 | `src/context/compaction.ts:216-220,428-434,504-505,510-514,560-565` |
| Provider 截断识别 | **是**：存在 `extractFinishReason`；请求在传入 `maxTokens` 时加入 `max_tokens`；显式 done 与连接提前关闭两个分支都可返回 `length`（前提是没有 tool call）。 | `src/ai/providers/openai-compatible.ts:428-430,521-524,612-617,656-661,1300-1314` |
| thinking / reasoning | **否/否**：请求体没有发送 `thinking`；Provider 未解析或回传 `reasoning_content`。 | `src/ai/providers/openai-compatible.ts:412-431`（请求体字段）；`:126-134`（响应字段）；全文件检索无 `thinking` / `reasoning_content` |
| `list_directory` | **是**：通过 `resolveWorkspacePath` 解析路径。 | `src/tools/list-directory.ts:82-86` |
| 符号链接检查 | **是**：逐段 `lstatSync` 检查已有路径部分是否为符号链接。 | `src/tools/workspace-path.ts:33-42` |
| 密钥文件拦截 | `read-file`、`edit-file`、`write-file`、`search-text` 调用 `assertNotSecretFile`；`search-text` 也调用 `isSecretFile` 跳过匹配文件。 | `src/tools/read-file.ts:104`；`src/tools/edit-file.ts:166`；`src/tools/write-file.ts:64`；`src/tools/search-text.ts:132,176` |
| 过时注释 | **是**：仍有“暂时还没有 Tool Call 循环”。 | `src/agent/agent-loop.ts:221` |
| README | 根目录 `.env` 说明为**否**：明确写着它不是 CLI 读取的配置；符号链接声明为**是**：称路径中的现有符号链接会被检查并拒绝。 | `README.md:57,145` |
| Budget 配置 | 上限为 `maxModelCalls: 50`、`maxToolCalls: 120`；工具调用超限原文：`Budget exceeded: tool_calls limit is ${limits.maxToolCalls}. No more tool calls will run in this task; finish now with the information you already have.` | `src/cli.ts:394-396`；`src/extensions/budget.ts:112` |
| 窗口默认值 | `DEFAULT_CONTEXT_WINDOW = 128_000`；`reserveTokens = min(16_384, floor(contextWindow / 8))`；`keepRecentTokens = min(20_000, floor(contextWindow / 4))`。 | `src/cli.ts:188,201-202` |
| `.gitignore` | 原文见下。 | `.gitignore:1-5` |
| 已跟踪的非代码文件 | 按 `git ls-files` 取不在 `src/`、`tests/` 下的所有条目。 | `git ls-files` |

#### `.gitignore` 原文
````text
.env
node_modules/
dist/
.idea/
note.md
````

#### 已跟踪的非代码文件清单
- `.gitignore`
- `README.md`
- `SOURCE_SNAPSHOT_M06_2026-09-28.md`
- `note.md`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.build.json`
- `tsconfig.json`

安全扫描时，README 示例中的 `sk-` 占位 Key 符合扫描格式，已从下方源码快照中移除；未发现真实 API Key。

## 3. Project Tree

根目录配置文件：
- `.gitignore`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.build.json`
- `tsconfig.json`
- `README.md`（源码正文见最后一节）

`src/` 下全部文件：
- `src/agent/agent-loop.ts`
- `src/agent/agent.ts`
- `src/agent/extension-host.ts`
- `src/agent/extension.ts`
- `src/agent/hooks.ts`
- `src/agent/types.ts`
- `src/ai/event-stream.ts`
- `src/ai/providers/openai-compatible.ts`
- `src/ai/types.ts`
- `src/cli.ts`
- `src/context/compaction.ts`
- `src/context/token-estimate.ts`
- `src/core/action-result.ts`
- `src/core/run-status.ts`
- `src/examples/coding-task.ts`
- `src/examples/file-tool-loop.ts`
- `src/examples/non-streaming.ts`
- `src/examples/streaming.ts`
- `src/examples/tool-calling.ts`
- `src/extensions/budget.ts`
- `src/extensions/command-approval.ts`
- `src/logging/logger-extension.ts`
- `src/prompts/coding-system-prompt.ts`
- `src/tools/edit-file.ts`
- `src/tools/list-directory.ts`
- `src/tools/read-file.ts`
- `src/tools/run-command.ts`
- `src/tools/search-text.ts`
- `src/tools/workspace-path.ts`
- `src/tools/write-file.ts`
- `src/trace/trace-collector.ts`
- `src/trace/trace-extension.ts`
- `src/trace/types.ts`

`tests/` 下全部文件：
- `tests/action-result.type-test.ts`
- `tests/agent-loop.test.ts`
- `tests/agent.test.ts`
- `tests/budget.test.ts`
- `tests/command-approval.test.ts`
- `tests/compaction.test.ts`
- `tests/edit-file.test.ts`
- `tests/event-stream.test.ts`
- `tests/extension-host.test.ts`
- `tests/fakes/fakes-stream.ts`
- `tests/fakes/list-directory.test.ts`
- `tests/openai-compatible.test.ts`
- `tests/read-file.test.ts`
- `tests/run-command.test.ts`
- `tests/run-status.type-test.ts`
- `tests/search-text.test.ts`
- `tests/token-estimate.test.ts`
- `tests/write-file.test.ts`

## 4. 文件全文

### `package.json`

````json
{
  "name": "agent-harness",
  "version": "1.0.0",
  "description": "",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "devEngines": {
    "packageManager": {
      "name": "pnpm",
      "version": "12.5.1",
      "onFail": "download"
    }
  },
  "packageManager": "pnpm@12.5.1",
  "type": "module",
  "bin": {
    "agent-harness": "dist/cli.js"
  },
  "devDependencies": {
    "@types/node": "^26.6.2",
    "typescript": "^7.0.2",
    "vitest": "^5.0.1"
  },
  "dependencies": {
    "typebox": "^1.3.34"
  }
}
````

### `tsconfig.json`

````json
//tsconfig.json→ TypeScript 怎么检查/编译代码
{
  "compilerOptions": {
    "target": "ES2022",

    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    "types": ["node"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    "verbatimModuleSyntax": true,
    "isolatedModules": true,

    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,

    "noEmit": true,

  },
  // noEmit只检查，不生成 JS。
  "include": [
    "src/**/*.ts",
    "tests/**/*.ts"
  ]
}
````

### `tsconfig.build.json`

````json
{
  "extends": "./tsconfig.json",

  "compilerOptions": {
    "noEmit": false,

    "rootDir": "./src",
    "outDir": "./dist"
  },

  "include": [
    "src/**/*.ts"
  ],

  "exclude": [
    "tests"
  ]
}
````

### `.gitignore`

````text
.env
node_modules/
dist/
.idea/
note.md
````

### `src/cli.ts`

````typescript
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


const DEFAULT_ENV_FILE =
  join(homedir(), ".agent-harness.env");

const HELP = `用法：agent-harness [选项] "任务描述"

在 Git 仓库里运行 coding agent。改动不会自动提交，请用 git diff 审查。

选项：
  -w, --workspace <dir>   工作目录（默认：当前目录；必须在 Git 仓库里）
  -m, --model <id>        模型 ID（默认：AGENT_MODEL）
      --env-file <path>   API 配置文件（默认：${DEFAULT_ENV_FILE}）
      --context-window <n>  覆盖模型的上下文窗口（默认 128000；调小可用来测试压缩）
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
      "context-window": { type: "string" },
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

// 默认值仍是占位：DeepSeek 实际的上下文窗口还没确认
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
});

// 总结调用不经过 Agent Loop；Budget 不计算总结调用，token 单独统计。
let compactionCount = 0;
let compactionInput = 0;
let compactionOutput = 0;

const compactor = createCompactor({
  model,
  streamFn,
  settings: compactionSettings,

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
      ].join(" "),
    );

    console.log(
      `----- summary -----\n${event.summary}\n-------------------\n`,
    );
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

console.log(
  "\n请检查改动：git diff；满意再 commit，不满意用 git restore . 回滚。",
);

process.exitCode = interrupted ? 130 : 0;
````

### `src/agent/agent-loop.ts`

````typescript
import Schema from "typebox/schema";

import type {
  AssistantMessage,
  Context,
  ToolCall,
  ToolResultMessage,
  SimpleStreamOptions,
} from "../ai/types.js";

import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentToolResult,
  StreamFn,
} from "./types.js";

import type {
  AgentRunStatus,
} from "./hooks.js";

import {
  createExtensionHost,
  type ExtensionHost,
} from "./extension-host.js";

/**
 * Agent Loop 不直接依赖 Agent class。
 * 它只负责产生事件，具体谁消费这些事件由外层决定。
 */
export type AgentEventSink = (
  event: AgentEvent,
) => Promise<void> | void;



function getToolCalls(
  message: AssistantMessage,
): ToolCall[] {
  return message.content.filter(
    (item): item is ToolCall =>
      item.type === "toolCall",
  );
}


function createToolErrorMessage(
  toolCall: ToolCall,
  error: unknown,
): ToolResultMessage {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  // 把错误包装成 ToolResultMessage
  return {
    role: "toolResult",

    toolCallId: toolCall.id,
    toolName: toolCall.name,

    content: [
      {
        type: "text",
        text: message,
      },
    ],

    isError: true,

    timestamp: Date.now(),
  };
}

async function executeToolCall(
  toolCall: ToolCall,
  context: AgentContext,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  turnIndex: number,
  extensionHost: ExtensionHost,
): Promise<ToolResultMessage> {

  const blocked = await extensionHost.beforeToolCall({
    turnIndex,
    toolCall,
  });

  if (blocked) {
    return createToolErrorMessage(
      toolCall,
      blocked.reason,
    );
  }

  const tool = context.tools?.find(
    (candidate) => candidate.name === toolCall.name,
  );

  if (!tool) {
    const errorMessage =
      `Tool not found: ${toolCall.name}`;

    await extensionHost.afterToolCall({
      turnIndex,
      toolCall,
      isError: true,
      errorMessage,
    });

    return createToolErrorMessage(
      toolCall,
      new Error(errorMessage),
    );
  }

  const validator = Schema.Compile(tool.parameters);

  if (!validator.Check(toolCall.arguments)) {
    const errorMessage =
      `Invalid arguments for tool: ${toolCall.name}`;

    await extensionHost.afterToolCall({
      turnIndex,
      toolCall,
      isError: true,
      errorMessage,
    });

    return createToolErrorMessage(
      toolCall,
      new Error(errorMessage),
    );
  }

  await emit({
    type: "tool_execution_start",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    args: toolCall.arguments,
  });

  let result: AgentToolResult;

  try {
    result = await tool.execute(
      toolCall.id,
      toolCall.arguments,
      signal,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    const toolResult =
      createToolErrorMessage(
        toolCall,
        error,
      );

    await extensionHost.afterToolCall({
      turnIndex,
      toolCall,
      isError: true,
      errorMessage,
    });

    await emit({
      type: "tool_execution_end",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result: toolResult,
      isError: true,
    });

    return toolResult;
  }

  const isError = result.isError ?? false;

  await emit({
    type: "tool_execution_end",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    result,
    isError,
  });

  await extensionHost.afterToolCall({
    turnIndex,
    toolCall,
    isError,
  });

  return {
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: result.content,
    isError,
    timestamp: Date.now(),
  };
}



/**
 * 执行一次最小 Agent Loop。
 *
 * 当前版本：
 * - 支持 prompt
 * - 支持 transformContext
 * - 支持 convertToLlm
 * - 支持流式模型输出
 *
 * 暂时还没有 Tool Call 循环。
 */
export async function runAgentLoop(
  prompts: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  streamFn: StreamFn,
  emit: AgentEventSink,
): Promise<AgentMessage[]> {
  const newMessages: AgentMessage[] = [
    ...prompts,
  ];

  const currentContext: AgentContext = {
    ...context,

    messages: [
      ...context.messages,
      ...prompts,
    ],
  };

  const extensionHost =
  createExtensionHost(config.extensions ?? []);

  let turnIndex = 0;
  let modelCallIndex = 0;
  let runStatus: AgentRunStatus = "completed";

async function startTurn(): Promise<void> {
  await extensionHost.onTurnStart({
    turnIndex,
  });

  await emit({ type: "turn_start" });
}

async function endTurn(
  message: AgentMessage,
  toolResults: AgentMessage[],
): Promise<void> {
  await extensionHost.onTurnEnd({
    turnIndex,
  });

  await emit({
    type: "turn_end",
    message,
    toolResults,
  });

  turnIndex += 1;
}

  try {
    await emit({
    type: "agent_start",
  });

  await startTurn();

  /*
   * prompt 本身进入 transcript。
   */
  for (const message of prompts) {
    await emit({
      type: "message_start",
      message,
    });

    await emit({
      type: "message_end",
      message,
    });
  }


  /*
   * M05.0：
   *
   * 第一次真正形成循环。
   *
   * Model
   * ↓
   * Tool
   * ↓
   * Model
   * ↓
   * ...
   */
  while (true) {
    let agentMessages =
      currentContext.messages;


    if (config.transformContext) {
      agentMessages =
        await config.transformContext(
          agentMessages,
          signal,
        );
    }


    const llmMessages =
      await config.convertToLlm(
        agentMessages,
      );


    const llmContext: Context = {
      ...(currentContext.systemPrompt
        ? {
            systemPrompt:
              currentContext.systemPrompt,
          }
        : {}),

      messages: llmMessages,
    };
    // 提取一份“工具说明卡片”
    const providerTools =
      currentContext.tools?.map(
        (tool) => ({
          name: tool.name,

          description:
            tool.description,

          parameters:
            tool.parameters,
        }),
      );


    const streamOptions:
      SimpleStreamOptions = {};


    if (signal) {
      streamOptions.signal =
        signal;
    }


    if (
      providerTools
      && providerTools.length > 0
    ) {
      streamOptions.tools =
        providerTools;
    }

    const modelCallId = `model-${modelCallIndex}`;
    modelCallIndex += 1;

    await extensionHost.beforeModelCall({
      callId: modelCallId,
      turnIndex,
      model: config.model,
      inputMessageCount: llmContext.messages.length,
    });

    const response =
      await streamFn(
        config.model,
        llmContext,

        Object.keys(
          streamOptions,
        ).length > 0
          ? streamOptions
          : undefined,
      );


    let finalMessage:
      AssistantMessage | undefined;


    for await (const event of response) {
      switch (event.type) {
        case "start": {
          await emit({
            type: "message_start",
            message: event.partial,
          });

          break;
        }


        case "text_delta": {
          await emit({
            type: "message_update",
            message: event.partial,
            assistantMessageEvent: event,
          });

          break;
        }


        case "done": {
          finalMessage =
            event.message;

          await emit({
            type: "message_end",
            message: event.message,
          });

          break;
        }


        case "error": {
          finalMessage =
            event.error;

          await emit({
            type: "message_end",
            message: event.error,
          });

          break;
        }
      }
    }


    if (!finalMessage) {
      throw new Error(
        "Assistant stream ended without a final message.",
      );
    }

    await extensionHost.afterModelCall({
      callId: modelCallId,
      turnIndex,
      message: finalMessage,
    });


    /*
     * 模型产生的 AssistantMessage
     * 正式进入当前上下文。
     */
    currentContext.messages.push(
      finalMessage,
    );

    newMessages.push(
      finalMessage,
    );


    /*
     * Provider/API 错误或取消：
     * 不应该继续执行 Tool。
     */
    if (
      finalMessage.stopReason === "error"
      || finalMessage.stopReason === "aborted"
    ) {
      runStatus = finalMessage.stopReason;
      await endTurn(finalMessage, []);
      break;
    }

    /*
     * 从 AssistantMessage 中寻找 ToolCall。
     */
    const toolCalls =
      getToolCalls(finalMessage);


    /*
     * 没有 ToolCall：
     *
     * 说明模型已经给出最终回答。
     */
    if (toolCalls.length === 0) {
      await endTurn(finalMessage, []);
      break;
    }


    /*
     * 有 ToolCall：
     *
     * Runtime 开始真正执行工具。
     */
    const toolResults: AgentMessage[] = [];


    for (const toolCall of toolCalls) {
      const toolResult = await executeToolCall(
        toolCall,
        currentContext,
        signal,
        emit,
        turnIndex,
        extensionHost,
      );

      /*
       * ToolResultMessage 本身也属于 transcript，
       * 因此走正常 message 生命周期。
       */
      await emit({
        type: "message_start",
        message: toolResult,
      });


      currentContext.messages.push(
        toolResult,
      );

      newMessages.push(
        toolResult,
      );

      toolResults.push(
        toolResult,
      );


      await emit({
        type: "message_end",
        message: toolResult,
      });
    }


    /*
     * 当前 Model → Tool turn 完成；
     * 下一轮再让模型处理工具结果。
     */
    await endTurn(finalMessage, toolResults);
    await startTurn();
  }


  await emit({
    type: "agent_end",
    messages: newMessages,
  });


  return newMessages;
  } catch (error) {
    runStatus = signal?.aborted
      ? "aborted"
      : "error";

    throw error;
  } finally {
      await extensionHost.onRunEnd({
        status: runStatus,
      });
    }
}
````

### `src/agent/agent.ts`

````typescript
import type {
  Model,
  UserMessage,
} from "../ai/types.js";

import {
  runAgentLoop,
} from "./agent-loop.js";

import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentState,
  AgentTool,
  StreamFn,
  ThinkingLevel,
} from "./types.js";


type MutableAgentState = {
  model: Model;

  systemPrompt: string;

  thinkingLevel: ThinkingLevel;

  tools: AgentTool[];

  messages: AgentMessage[];

  isStreaming: boolean;

  // 明确允许赋值 undefined。
  streamingMessage:
    AgentMessage | undefined;

  pendingToolCalls:
    Set<string>;

  // 明确允许赋值 undefined。
  errorMessage:
    string | undefined;
};


export type AgentInitialState = {
  model: Model;

  systemPrompt?: string;

  thinkingLevel?: ThinkingLevel;

  tools?: AgentTool[];

  messages?: AgentMessage[];
};


export type AgentOptions = {
  initialState: AgentInitialState;

  // model 由 Agent 自己的 state 持有，
  // 所以外部只传剩余的 Loop 配置。
  loopConfig:
    Omit<AgentLoopConfig, "model">;

  // 真正负责调用模型并返回事件流。
  streamFn: StreamFn;
};


export type AgentEventListener = (
  event: AgentEvent,
  signal: AbortSignal,
) => Promise<void> | void;


export class Agent {
  private readonly internalState: MutableAgentState;

  private readonly listeners =
    new Set<AgentEventListener>();

  // 注意：这里只保留一个 loopConfig。
  private readonly loopConfig:
    Omit<AgentLoopConfig, "model">;

  private readonly streamFn: StreamFn;

  private abortController: AbortController | undefined;


  constructor(options: AgentOptions) {
    const initialState = options.initialState;

    // 保存 Loop 配置。
    this.loopConfig = options.loopConfig;

    // 保存模型流入口。
    this.streamFn = options.streamFn;

    this.internalState = {
      model: initialState.model,

      systemPrompt:
        initialState.systemPrompt ?? "",

      thinkingLevel:
        initialState.thinkingLevel ?? "off",

      tools:
        initialState.tools?.slice() ?? [],

      messages:
        initialState.messages?.slice() ?? [],

      isStreaming: false,

      streamingMessage: undefined,

      pendingToolCalls: new Set<string>(),

      errorMessage: undefined,
    };
  }


  get state(): AgentState {
    return this.internalState;
  }


  get signal(): AbortSignal | undefined {
    return this.abortController?.signal;
  }


  subscribe(
    listener: AgentEventListener,
  ): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }


  async prompt(
    input: string | AgentMessage | AgentMessage[],
  ): Promise<void> {
    const prompts =
      this.normalizePromptInput(input);

    const signal = this.startRun();

    try {
      // Agent 当前 state 里的 model，
      // 和外部提供的 Loop 配置，在这里组合成完整配置。
      const config: AgentLoopConfig = {
        model: this.internalState.model,

        convertToLlm:
          this.loopConfig.convertToLlm,

        ...(this.loopConfig.transformContext
          ? {
              transformContext:
                this.loopConfig.transformContext,
            }
          : {}),

      ...(this.loopConfig.extensions
          ? {
             extensions: this.loopConfig.extensions,
            }
          : {}),
      };


      await runAgentLoop(
        prompts,

        this.createContextSnapshot(),

        config,

        signal,

        this.streamFn,

        (event) =>
          this.processEvent(event),
      );
    } finally {
      this.finishRun();
    }
  }


  abort(): void {
    this.abortController?.abort();
  }


  reset(): void {
    if (this.internalState.isStreaming) {
      throw new Error(
        "Agent is already processing. Wait for completion before resetting.",
      );
    }

    this.internalState.messages = [];

    this.internalState.streamingMessage =
      undefined;

    this.internalState.pendingToolCalls =
      new Set<string>();

    this.internalState.errorMessage =
      undefined;
  }


  private normalizePromptInput(
    input: string | AgentMessage | AgentMessage[],
  ): AgentMessage[] {
    if (Array.isArray(input)) {
      return input;
    }

    if (typeof input !== "string") {
      return [input];
    }

    const message: UserMessage = {
      role: "user",

      content: [
        {
          type: "text",
          text: input,
        },
      ],

      timestamp: Date.now(),
    };

    return [message];
  }

// 把 Agent 当前的历史消息和工具复制一份，交给这次运行使用。Agent 正在运行时，最好不要直接修改 Agent 原来的内部状态。
  private createContextSnapshot(): AgentContext {
    return {
      ...(this.internalState.systemPrompt
        ? {
            systemPrompt:
              this.internalState.systemPrompt,
          }
        : {}),

      messages: [
        ...this.internalState.messages,
      ],

      tools: [
        ...this.internalState.tools,
      ],
    };
  }


  /**
   * Agent Loop 发出来的事件，
   * 在这里同步回 AgentState。
   */
  private async processEvent(
    event: AgentEvent,
  ): Promise<void> {
    // Assistant 开始生成时，
    // 保存当前 streaming message。
    if (
      event.type === "message_start"
      && event.message.role === "assistant"
    ) {
      this.internalState.streamingMessage =
        event.message;
    }


    // 每个流式增量到来时，
    // 更新当前正在生成的消息。
    // 模型可能这样生成：
    //
    // "你"
    // ↓
    // "你好"
    // ↓
    // "你好，我"
    // ↓
    // "你好，我可以..."
    //
    // 每更新一次，就产生：
    if (event.type === "message_update") {
      this.internalState.streamingMessage =
        event.message;
    }


    // 完整消息结束后，正式加入 transcript。
    if (event.type === "message_end") {
      this.internalState.messages.push(
        event.message,
      );

      if (event.message.role === "assistant") {
        this.internalState.streamingMessage =
          undefined;

        // 普通模型错误 / abort 被编码进 AssistantMessage。
        if (
          event.message.stopReason === "error"
          || event.message.stopReason === "aborted"
        ) {
          this.internalState.errorMessage =
            event.message.errorMessage;
        }
      }
    }


    // 最后把事件继续通知所有订阅者。
    await this.emit(event);
  }


  private startRun(): AbortSignal {
    if (this.internalState.isStreaming) {
      throw new Error(
        "Agent is already processing.",
      );
    }

    this.abortController =
      new AbortController();

    this.internalState.isStreaming = true;

    // 新 run 开始前清掉上一次错误。
    this.internalState.errorMessage =
      undefined;

    return this.abortController.signal;
  }


  private finishRun(): void {
    this.internalState.isStreaming = false;

    this.internalState.streamingMessage =
      undefined;

    this.internalState.pendingToolCalls =
      new Set<string>();

    this.abortController = undefined;
  }


  private async emit(
    event: AgentEvent,
  ): Promise<void> {
    const signal =
      this.abortController?.signal;

    if (!signal) {
      throw new Error(
        "Cannot emit an AgentEvent outside an active run.",
      );
    }

    for (const listener of this.listeners) {
      await listener(event, signal);
    }
  }
}
````

### `src/agent/extension-host.ts`

````typescript
import type {
  AssistantMessage,
  Model,
  ToolCall,
} from "../ai/types.js";

import type {
  AgentRunStatus,
  BeforeToolCallResult,
} from "./hooks.js";

import type {
  AgentExtension,
} from "./extension.js";


export type ExtensionHost = {
  onTurnStart(input: {
    turnIndex: number;
  }): Promise<void>;

  beforeModelCall(input: {
    callId: string;
    turnIndex: number;
    model: Model;
    inputMessageCount: number;
  }): Promise<void>;

  afterModelCall(input: {
    callId: string;
    turnIndex: number;
    message: AssistantMessage;
  }): Promise<void>;

  beforeToolCall(input: {
    turnIndex: number;
    toolCall: ToolCall;
  }): Promise<BeforeToolCallResult | undefined>;

  afterToolCall(input: {
    turnIndex: number;
    toolCall: ToolCall;
    isError: boolean;
    errorMessage?: string;
  }): Promise<void>;

  onTurnEnd(input: {
    turnIndex: number;
  }): Promise<void>;

  onRunEnd(input: {
    status: AgentRunStatus;
  }): Promise<void>;
};


/**
 * Lifecycle contract:
 * - Extensions run in registration order; there is no priority system.
 * - before* hooks are fail-fast gates: a thrown error stops later hooks and
 *   prevents the Agent Loop from starting the core operation.
 * - The Agent Loop calls after* only after the matching before* phase passes.
 *   A failed tool call still reports afterToolCall({ isError: true }).
 * - The Agent Loop dispatches onRunEnd from finally, including failed runs.
 * - Hook errors propagate; extensions are not isolated from one another.
 */
export function createExtensionHost(
  extensions: AgentExtension[],
): ExtensionHost {
  return {
    async onTurnStart(input) {
      for (const extension of extensions) {
        await extension.hooks.onTurnStart?.(input);
      }
    },

    async beforeModelCall(input) {
      for (const extension of extensions) {
        await extension.hooks.beforeModelCall?.(input);
      }
    },

    async afterModelCall(input) {
      for (const extension of extensions) {
        await extension.hooks.afterModelCall?.(input);
      }
    },

    async beforeToolCall(input) {
      for (const extension of extensions) {
        const result =
          await extension.hooks.beforeToolCall?.(input);

        if (result) {
          return result;
        }
      }

      return undefined;
    },

    async afterToolCall(input) {
      for (const extension of extensions) {
        await extension.hooks.afterToolCall?.(input);
      }
    },

    async onTurnEnd(input) {
      for (const extension of extensions) {
        await extension.hooks.onTurnEnd?.(input);
      }
    },

    async onRunEnd(input) {
      for (const extension of extensions) {
        await extension.hooks.onRunEnd?.(input);
      }
    },
  };
}
````

### `src/agent/extension.ts`

````typescript
import type {
  AgentLoopHooks,
} from "./hooks.js";


export type AgentExtension = {
  name: string;
  hooks: AgentLoopHooks;
};
````

### `src/agent/hooks.ts`

````typescript
import type {
  AssistantMessage,
  Model,
  ToolCall,
} from "../ai/types.js";


export type AgentRunStatus =
  | "completed"
  | "error"
  | "aborted";


type MaybePromise<T> =
  T | Promise<T>;

export type BeforeToolCallResult = {
  block: true;
  reason: string;
};

export type AgentLoopHooks = {
  onTurnStart?(
    input: {
      turnIndex: number;
    },
  ): MaybePromise<void>;

  beforeModelCall?(
    input: {
      callId: string;
      turnIndex: number;
      model: Model;
      inputMessageCount: number;
    },
  ): MaybePromise<void>;

  afterModelCall?(
    input: {
      callId: string;
      turnIndex: number;
      message: AssistantMessage;
    },
  ): MaybePromise<void>;

  beforeToolCall?(
    input: {
      turnIndex: number;
      toolCall: ToolCall;
    },
  ): MaybePromise<BeforeToolCallResult | void>;

  afterToolCall?(
    input: {
      turnIndex: number;
      toolCall: ToolCall;
      isError: boolean;
      errorMessage?: string;
    },
  ): MaybePromise<void>;

  onTurnEnd?(
    input: {
      turnIndex: number;
    },
  ): MaybePromise<void>;

  onRunEnd?(
    input: {
      status: AgentRunStatus;
    },
  ): MaybePromise<void>;
};
````

### `src/agent/types.ts`

````typescript
import type {
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Context,
  Message,
  Model,
  SimpleStreamOptions,
  TextContent,
  Tool,
} from "../ai/types.js";

import Type from "typebox";

import type {
  AgentExtension,
} from "./extension.js";


// CustomAgentMessages 是扩展槽；AgentMessage 是 Agent 最终允许使用的全部消息。
export interface CustomAgentMessages {
}


export type AgentMessage =
  | Message
  | CustomAgentMessages[keyof CustomAgentMessages];


export type AgentToolResult<TDetails = unknown> = {
  content: TextContent[];

  details: TDetails;

  isError?: boolean;
};


export type AgentTool<
  TParameters extends Type.TSchema =
    Type.TSchema,
  TDetails = unknown,
> =
  // AgentTool 使用的 Schema，和它继承的 Tool 使用的是同一个 Schema。
  Tool<TParameters>
  & {
    label: string;

    execute(
      toolCallId: string,

      parameters:
        Type.Static<TParameters>,

      signal?: AbortSignal,
    ): Promise<AgentToolResult<TDetails>>;
  };

export type AgentContext = {
  systemPrompt?: string;
  messages: AgentMessage[];
  tools?: AgentTool[];
};


export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";


export type AgentState = {
  model: Model;
  systemPrompt: string;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool[];
  messages: AgentMessage[];

  readonly isStreaming: boolean;

  // 这个状态槽始终存在，只是有时没有正在生成的消息。
  readonly streamingMessage:
    AgentMessage | undefined;

  readonly pendingToolCalls:
    ReadonlySet<string>;

  // 同理：始终存在，但没有错误时值为 undefined。
  readonly errorMessage:
    string | undefined;
};


export type AgentEvent =
  | {
      type: "agent_start";
    }
  | {
      type: "agent_end";
      messages: AgentMessage[];
    }
  | {
      type: "turn_start";
    }
  | {
      type: "turn_end";
      message: AgentMessage;
      toolResults: AgentMessage[];
    }
  | {
      type: "message_start";
      message: AgentMessage;
    }
  | {
      type: "message_end";
      message: AgentMessage;
    }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }| {
    type: "message_update";
    message: AgentMessage;
    assistantMessageEvent: AssistantMessageEvent;
  };

// agent_start / agent_end
// turn_start / turn_end
// message_start / message_update / message_end
// tool_execution_start / update / end


// 负责真正调用模型，并返回：
// AssistantMessageEventStream
export type StreamFn = (
  model: Model,
  context: Context,
  options: SimpleStreamOptions | undefined,
) =>
  | AssistantMessageEventStream
  | Promise<AssistantMessageEventStream>;


// 这里保存 Agent Loop 运行时需要的配置
export type AgentLoopConfig = {
  // 当前 run 使用哪个模型。
  model: Model;

  // 必须存在：
  // AgentMessage 最终一定需要转换成模型能接受的 Message。
  convertToLlm: (
    messages: AgentMessage[],
  ) => Message[] | Promise<Message[]>;

  // 可选的上下文处理函数。例如在送给模型前删掉旧消息，或整理上下文。? 表示可以不提供。
  transformContext?: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>;

  // 扩展按数组顺序接收生命周期通知；不传时照常运行。
  extensions?: AgentExtension[];
};
````

### `src/ai/event-stream.ts`

````typescript
import type {
  AssistantMessageEvent,
  AssistantMessageEventStream,
} from "./types.js";


export class SimpleAssistantMessageEventStream
  implements AssistantMessageEventStream
{
  private readonly queue:
    AssistantMessageEvent[] = [];

  private readonly waiters: Array<
    (
      result:
        IteratorResult<AssistantMessageEvent>,
    ) => void
  > = [];

  private ended = false;


  push(event: AssistantMessageEvent): void {
    if (this.ended) {
      throw new Error(
        "Cannot push to an ended stream.",
      );
    }

    const waiter = this.waiters.shift();

    if (waiter) {
      waiter({
        value: event,
        done: false,
      });

      return;
    }

    this.queue.push(event);
  }


  end(): void {
    if (this.ended) {
      return;
    }

    this.ended = true;

    for (const waiter of this.waiters) {
      waiter({
        value: undefined,
        done: true,
      });
    }

    this.waiters.length = 0;
  }


  [Symbol.asyncIterator]():
    AsyncIterator<AssistantMessageEvent> {
    return {
      next: () => {
        const event = this.queue.shift();

        if (event) {
          return Promise.resolve({
            value: event,
            done: false,
          });
        }

        if (this.ended) {
          return Promise.resolve({
            value: undefined,
            done: true,
          });
        }

        return new Promise<
          IteratorResult<AssistantMessageEvent>
        >((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}


// 消息传送管道，模型不断产生消息
//       ↓
// stream.push()
//       ↓
// Agent 不断读取消息

export function createAssistantMessageEventStream():
  SimpleAssistantMessageEventStream {
  return new SimpleAssistantMessageEventStream();
}
// AssistantMessageEventStream 是一个基于异步迭代协议的助手消息事件流接口。
````

### `src/ai/providers/openai-compatible.ts`

````typescript
import {
  createAssistantMessageEventStream,
} from "../event-stream.js";

import type {
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Message,
  Model,
  SimpleStreamOptions,
  TextContent,
  Tool,
  ToolCall,
  Usage,
} from "../types.js";


import type {
  StreamFn,
} from "../../agent/types.js";


/**
 * OpenAI-compatible Provider 所需要的配置。
 *
 * 注意：
 * 这些配置属于 Provider 层，
 * Agent / AgentLoop 不应该知道它们。
 */
export type OpenAICompatibleProviderConfig = {
  /**
   * 调用模型 API 所需的密钥。
   */
  apiKey: string;

  /**
   * API 基础地址。
   *
   * 例如未来可能是：
   * https://xxx/v1
   */
  baseUrl: string;

  /**
   * 某些 Provider 可能需要额外 HTTP Header。
   */
  headers?: Record<string, string>;
};


type OpenAIFunctionTool = {
  type: "function";

  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
};

function toOpenAITool(
  tool: Tool,
): OpenAIFunctionTool {
  return {
    type: "function",

    function: {
      name: tool.name,

      description:
        tool.description,

      parameters:
        tool.parameters,
    },
  };
}

export type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};


/**
 * OpenAI-compatible API 接收的消息格式。
 *
 * 注意：
 * 这是“Provider 外部协议”，
 * 不是我们 Agent Core 内部的 Message。
 */
export type OpenAIChatMessage = {
  role:
    | "system"
    | "user"
    | "assistant"
    | "tool";

  /**
   * 当前 M04 阶段只处理文本。
   */
  content: string | null;
  tool_calls?: OpenAIToolCall[];

  /**
   * 只有 tool 消息需要。
   *
   * 表示这个工具结果对应哪一个 tool call。
   */
  tool_call_id?: string;
};


/**
 * OpenAI-compatible 非流式 Chat Completion
 * 最小响应结构。
 *
 * 当前只声明我们 M04 真正需要的字段。
 * 后面 Tool / Usage 再逐步补。
 */
type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      role?: "assistant";
      content?: string | null;
    };

    finish_reason?: string | null;
  }>;
};



/**
 * 从我们统一的 Message 中提取纯文本。
 *
 * 不同 role 的 content 类型并不完全一样：
 *
 * system:
 *   string
 *
 * user:
 *   string | TextContent[]
 *
 * assistant:
 *   (TextContent | ToolCall)[]
 *
 * toolResult:
 *   TextContent[]
 *
 * 所以这里按 role 分别处理，
 * 让 TypeScript 能明确知道当前 content 到底是什么类型。
 */
function messageText(
  message: Message,
): string {
  switch (message.role) {
    case "system": {
      // SystemMessage.content 一定是 string。
      return message.content;
    }


    case "user": {
      /*
       * UserMessage 比较特殊：
       *
       * content 可以直接是 string，
       * 也可以是 TextContent[]。
       */
      if (typeof message.content === "string") {
        return message.content;
      }

      return message.content
        .map((item) => item.text)
        .join("");
    }


    case "assistant": {
      /*
       * AssistantMessage.content 可能同时包含：
       *
       * TextContent
       * ToolCall
       *
       * 当前 M04 阶段只提取 text。
       */

      return message.content
        .filter(
          (item): item is TextContent =>
            item.type === "text",
        )
        .map(
          (item) => item.text,
        )
        .join("");
    }


    case "toolResult": {
      /*
       * ToolResultMessage.content
       * 当前就是 TextContent[]。
       */
      return message.content
        .map((item) => item.text)
        .join("");
    }
  }
}


/**
 * 把我们自己的统一 Message
 * 转成 OpenAI-compatible API 的消息。
 */
export function toOpenAIMessage(
  message: Message,
): OpenAIChatMessage {
  switch (message.role) {
    /*
     * SystemMessage：
     *
     * 我们：
     * { role: "system", content: "..." }
     *
     * API：
     * { role: "system", content: "..." }
     */
    case "system":
      return {
        role: "system",
        content: message.content,
      };


    /*
     * UserMessage：
     *
     * content 既可能是 string，
     * 也可能是 TextContent[]。
     *
     * Provider 在这里统一转成 string。
     */
    case "user":
      return {
        role: "user",
        content: messageText(message),
      };


    case "assistant": {
      const text = messageText(message);

      const toolCalls = message.content.filter(
        (item): item is ToolCall =>
          item.type === "toolCall",
      );

      if (toolCalls.length === 0) {
        return {
          role: "assistant",
          content: text,
        };
      }

      return {
        role: "assistant",
        content: text.length > 0 ? text : null,
        tool_calls: toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function" as const,
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments),
          },
        })),
      };
    }


    /*
     * 我们内部叫：
     *
     * role: "toolResult"
     *
     * OpenAI-compatible API 一般叫：
     *
     * role: "tool"
     *
     * 所以这里存在一个真正的协议转换。
     */
    case "toolResult":
      return {
        role: "tool",

        tool_call_id:
          message.toolCallId,

        content:
          messageText(message),
      };
  }
}


function toOpenAIMessages(
  context: Context,
): OpenAIChatMessage[] {
  const messages =
    context.messages.map(toOpenAIMessage);

  if (context.systemPrompt) {
    return [
      {
        role: "system",
        content: context.systemPrompt,
      },
      ...messages,
    ];
  }

  return messages;
}



/**
 * 创建 OpenAI-compatible StreamFn。
 *
 * Agent Core 只知道 StreamFn，
 * 并不知道这里面使用的是：
 *
 * fetch
 * SSE
 * OpenAI-compatible API
 */
export function createOpenAICompatibleStreamFn(
  config: OpenAICompatibleProviderConfig,
): StreamFn {
  return (
    model: Model,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream => {
    const stream =
      createAssistantMessageEventStream();


    /**
     * StreamFn 必须立刻返回 stream。
     *
     * 真正的 HTTP 工作在后台异步执行，
     * 后续不断向 stream.push(event)。
     */
    void (async () => {
      /**
       * 保存到目前为止模型已经生成的完整文本。
       *
       * Provider 给我们的 delta 可能是：
       *
       * "你"
       * "好"
       *
       * 但 partial message 需要：
       *
       * "你"
       * "你好"
       */
      let fullText = "";
      let usage: Usage | undefined;
      let finishReason: string | undefined;

      type PendingToolCall = {
        id?: string;
        name?: string;
        argumentsJson: string;
      };

      const pendingToolCalls =
        new Map<number, PendingToolCall>();


      try {
        const baseUrl =
          config.baseUrl.replace(
            /\/+$/,
            "",
          );

        const requestInit: RequestInit = {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${config.apiKey}`,

            ...(config.headers ?? {}),
          },

          body: JSON.stringify({
            model: model.id,
            messages: toOpenAIMessages(context),
            ...(options?.tools?.length
            ? {
                tools: options.tools.map(
                  toOpenAITool,
                ),
              }
            : {}),

            stream: true,
            // 让 Provider 在流的最后一个 chunk 里返回 usage
            stream_options: {
              include_usage: true,
            },
            ...(options?.maxTokens !== undefined
              ? { max_tokens: options.maxTokens }
              : {}),
          }),
        };


        /**
         * 把 Agent 的取消信号继续向网络层传。
         */
        if (options?.signal) {
          requestInit.signal =
            options.signal;
        }


        const response = await fetch(
          `${baseUrl}/chat/completions`,
          requestInit,
        );


        if (!response.ok) {
          const body =
            await response.text();

          throw new Error(
            `Provider HTTP ${response.status}: ${body}`,
          );
        }


        if (!response.body) {
          throw new Error(
            "Provider returned no response body.",
          );
        }


        /**
         * HTTP 已经建立成功。
         *
         * 先告诉 Agent：
         * Assistant message 开始生成了。
         */
        stream.push({
          type: "start",

          partial:
            createAssistantMessage(
              model,
              "",
            ),
        });


        /**
         * 第一层：
         *
         * HTTP bytes
         *      ↓
         * 完整 SSE block
         */
        for await (
          const block of
            readSseBlocks(
              response.body,
            )
        ) {
          /**
           * 第二层：
           *
           * SSE block
           *      ↓
           * data 字段
           */
          const data =
            extractSseData(
              block,
            );


          if (data === undefined) {
            continue;
          }

          const chunkUsage =
            extractOpenAIUsage(data);

          if (chunkUsage) {
            usage = chunkUsage;
          }

          const chunkFinish = extractFinishReason(data);

          if (chunkFinish) {
            finishReason = chunkFinish;
          }


          /**
           * 第三层：
           *
           * Provider JSON
           *      ↓
           * text_delta / done / ignore
           */
          const parsed =
            parseOpenAIStreamData(
              data,
            );


          switch (parsed.type) {
            case "ignore": {
              break;
            }

            case "tool_call_delta": {
              for (const delta of parsed.toolCalls) {
                const pending =
                  pendingToolCalls.get(delta.index) ?? {
                    argumentsJson: "",
                  };

                if (delta.id) {
                  pending.id = delta.id;
                }

                if (delta.name) {
                  pending.name = delta.name;
                }

                if (delta.argumentsDelta !== undefined) {
                  pending.argumentsJson += delta.argumentsDelta;
                }

                pendingToolCalls.set(delta.index, pending);
              }

              break;
            }


            case "text_delta": {
              /**
               * delta 只是新增部分。
               *
               * 所以需要自己维护完整文本。
               */
              fullText +=
                parsed.delta;


              const partial =
                createAssistantMessage(
                  model,
                  fullText,
                );


              stream.push({
                type:
                  "text_delta",

                contentIndex: 0,

                delta:
                  parsed.delta,

                partial,
              });

              break;
            }


            case "done": {
              /**
               * 模型输出完成。
               */
              const toolCalls =
                  finalizeToolCalls(pendingToolCalls);

              const reason =
                toolCalls.length > 0
                  ? "toolUse"
                  : finishReason === "length"
                    ? "length"
                    : "stop";

              const message = createAssistantMessage(
                model,
                fullText,
                reason,
                undefined,
                toolCalls,
              );

              if (usage) {
                message.usage = usage;
              }


              stream.push({
                type: "done",
                reason,
                message,
              });


              stream.end();

              return;
            }
          }
        }


        /**
         * 有些兼容 API 可能直接关闭连接，
         * 没有显式发送 [DONE]。
         *
         * 这时也正常完成 stream。
         */
        const toolCalls =
          finalizeToolCalls(pendingToolCalls);

        const reason =
          toolCalls.length > 0
            ? "toolUse"
            : finishReason === "length"
              ? "length"
              : "stop";

        const message = createAssistantMessage(
          model,
          fullText,
          reason,
          undefined,
          toolCalls,
        );

        if (usage) {
          message.usage = usage;
        }

        stream.push({
          type: "done",
          reason,
          message,
        });


        stream.end();
      } catch (error) {
        /**
         * 判断是不是 AbortSignal 导致的取消。
         */
        const aborted =
          options?.signal?.aborted
            === true;


        const message =
          createAssistantMessage(
            model,
            fullText,

            aborted
              ? "aborted"
              : "error",

            error instanceof Error
              ? error.message
              : String(error),
          );


        /**
         * 注意：
         *
         * 普通 Provider/API 错误，
         * 我们不让 StreamFn 的 Promise reject。
         *
         * 而是编码成统一的 stream error event。
         *
         * 这正是我们之前对齐 Pi 的语义。
         */
        stream.push({
          type: "error",

          reason:
            aborted
              ? "aborted"
              : "error",

          error: message,
        });


        stream.end();
      }
    })();


    /**
     * StreamFn 本身立即返回。
     *
     * HTTP 结果后续通过这个对象不断流出来。
     */
    return stream;
  };
}



/**
 * 发送一次非流式模型请求。
 *
 * 这一函数暂时只是 M04 的学习入口：
 *
 * Context
 *   ↓
 * 转 Provider Message
 *   ↓
 * fetch()
 *   ↓
 * JSON
 *   ↓
 * assistant text
 *
 * 下一阶段会把它升级成真正的 SSE streaming。
 */
export async function requestChatCompletionOnce(
  config: OpenAICompatibleProviderConfig,
  model: Model,
  context: Context,
  options?: SimpleStreamOptions,
): Promise<string> {

  const baseUrl =
    config.baseUrl.replace(/\/+$/, "");


  /*
   * RequestInit 是 fetch() 的标准配置对象。
   */
  const requestInit: RequestInit = {
    method: "POST",

    headers: {
      "Content-Type": "application/json",

      /*
       * OpenAI-compatible API
       * 通常使用 Bearer Token。
       */
      Authorization:
        `Bearer ${config.apiKey}`,

      /*
       * 允许未来某些 Provider
       * 添加自己的额外 Header。
       */
      ...(config.headers ?? {}),
    },


    /*
     * 真正发送给模型的 JSON。
     *
     * 这里注意：
     * context.messages 是我们统一的 Message，
     * 发送前必须转换成 Provider 协议。
     */
    body: JSON.stringify({
      model: model.id,

      messages: toOpenAIMessages(context),

      /*
       * 当前故意关闭 streaming。
       */
      stream: false,
    }),
  };


  /*
   * 因为启用了：
   *
   * exactOptionalPropertyTypes
   *
   * 所以不要直接：
   *
   * signal: options?.signal
   *
   * 而是在确实存在 signal 时再添加。
   */
  if (options?.signal) {
    requestInit.signal =
      options.signal;
  }


  const response = await fetch(
    `${baseUrl}/chat/completions`,
    requestInit,
  );


  /*
   * fetch 有一个容易误解的地方：
   *
   * HTTP 401 / 404 / 500
   * 不会自动 throw。
   *
   * 只有网络层错误通常才 reject。
   *
   * 所以必须自己检查 response.ok。
   */
  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `Provider HTTP ${response.status}: ${body}`,
    );
  }


  const data = (await response.json()) as OpenAIChatCompletionResponse;


  const content =
    data.choices?.[0]
      ?.message?.content;


  /*
   * 这是第一次开始碰到：
   *
   * 外部 unknown data
   *      ↓
   * runtime check
   *
   * 现在只做最小检查。
   * 后续再考虑 Zod 等完整 validator。
   */
  if (typeof content !== "string") {
    throw new Error(
      "Provider response does not contain assistant text.",
    );
  }


  return content;
}



/**
 * OpenAI-compatible Streaming API
 * 每一个 SSE data 块中 JSON 的最小结构。
 *
 * 例如：
 *
 * {
 *   "choices": [
 *     {
 *       "delta": {
 *         "content": "你"
 *       },
 *       "finish_reason": null
 *     }
 *   ]
 * }
 */
type OpenAIStreamChunk = {
  choices?: Array<{
    /**
     * delta 表示“本次新增的内容”，
     * 不是完整 AssistantMessage。
     */
  delta?: {
    content?: string | null;

    tool_calls?: Array<{
      index?: number;
      id?: string;
      type?: "function";
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };

    /**
     * 流还没结束时通常是 null。
     *
     * 最后一段可能出现：
     * "stop"
     * "length"
     * "tool_calls"
     */
    finish_reason?: string | null;
  }>;
};


/**
 * Provider 层解析 SSE data 后得到的结果。
 *
 * 它还不是 AgentEvent。
 *
 * 这里只回答：
 * “OpenAI-compatible API 这一次到底发来了什么？”
 */
export type ParsedStreamData =
  | {
      type: "text_delta";

      /**
       * 本次新增的文本。
       *
       * 例如：
       * "你"
       * "好"
       */
      delta: string;
    }
  | {
      type: "done";
    }
  | {
      /**
       * API 有时会发送没有文本内容的 chunk。
       *
       * 例如只包含 role、usage 等信息。
       *
       * 这种情况不是错误，
       * 只是当前阶段没有我们关心的数据。
       */
      type: "ignore";
    }| {
      type: "tool_call_delta";
      toolCalls: Array<{
        index: number;
        id?: string;
        name?: string;
        argumentsDelta?: string;
      }>;
    };


// data: {"choices":[{"delta":{"content":"你"}}]}
//
// data: {"choices":[{"delta":{"content":"好"}}]}
//
// data: [DONE]
export function extractSseData(
  block: string,
): string | undefined {
  const lines =
    block.split(/\r?\n/);


  const dataLines =
    lines
      .filter(
        (line) =>
          line.startsWith("data:"),
      )
      .map(
        (line) =>
          line
            .slice("data:".length)
            .trimStart(),
      );


  if (dataLines.length === 0) {
    return undefined;
  }


  return dataLines.join("\n");
}



/**
 * 把 HTTP response.body 中的字节流，
 * 切分成一个个完整的 SSE block。
 *
 * 注意：
 * 网络 chunk 边界和 SSE 事件边界完全不是一回事。
 *
 * 一个 SSE block 通常由空行分隔：
 *
 * data: {...}
 *
 * data: {...}
 */
export async function* readSseBlocks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  /**
   * HTTP body 给我们的是 Uint8Array。
   *
   * TextDecoder 用来：
   *
   * Uint8Array
   *      ↓
   * string
   */
  const decoder =
    new TextDecoder();


  /**
   * 保存“还不够组成完整 SSE block”的文本。
   */
  let buffer = "";


  const reader =
    body.getReader();


  try {
    while (true) {
      const {
        done,
        value,
      } = await reader.read();


      if (done) {
        break;
      }


      /**
       * stream: true 很重要。
       *
       * 因为一个 UTF-8 字符本身也可能
       * 被拆到两个网络 chunk 中。
       */
      buffer += decoder.decode(
        value,
        {
          stream: true,
        },
      );


      /**
       * SSE event 之间通常由一个空行分隔：
       *
       * \n\n
       *
       * Windows 风格也可能出现：
       *
       * \r\n\r\n
       */
      const blocks =
        buffer.split(/\r?\n\r?\n/);


      /**
       * 最后一个元素可能是不完整的。
       *
       * 所以不能立即 yield，
       * 要留下来等待下一批网络数据。
       */
      buffer =
        blocks.pop() ?? "";


      for (const block of blocks) {
        if (block.trim().length > 0) {
          yield block;
        }
      }
    }


    /**
     * 告诉 decoder：
     * 输入已经彻底结束。
     *
     * 如果内部还有未 flush 的 UTF-8 状态，
     * 会在这里吐出来。
     */
    buffer += decoder.decode();


    /**
     * 某些服务最后可能没有再补空行。
     *
     * 如果还剩有效内容，
     * 最后再交给消费者一次。
     */
    if (buffer.trim().length > 0) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}




/**
 * 解析一个 SSE data 字符串。
 *
 * 输入示例：
 *
 * {"choices":[{"delta":{"content":"你"}}]}
 *
 * 或：
 *
 * [DONE]
 *
 * 输出：
 *
 * { type: "text_delta", delta: "你" }
 *
 * 或：
 *
 * { type: "done" }
 */
export function parseOpenAIStreamData(
  data: string,
): ParsedStreamData {
  /**
   * OpenAI-compatible SSE 通常使用：
   *
   * data: [DONE]
   *
   * 表示整个流结束。
   */
  if (data === "[DONE]") {
    return {
      type: "done",
    };
  }


  /**
   * 现在才进入 JSON 协议这一层。
   *
   * SSE 层已经由 extractSseData()
   * 处理完成。
   */
  const chunk =
    JSON.parse(data) as OpenAIStreamChunk;


  /**
   * 当前阶段只看第一个 choice。
   */
  const choice =
    chunk.choices?.[0];


  if (!choice) {
    return {
      type: "ignore",
    };
  }

  const rawToolCalls = choice.delta?.tool_calls;

  if (rawToolCalls && rawToolCalls.length > 0) {
    const toolCalls: Array<{
      index: number;
      id?: string;
      name?: string;
      argumentsDelta?: string;
    }> = [];

    for (const rawToolCall of rawToolCalls) {
      if (typeof rawToolCall.index !== "number") {
        continue;
      }

      const parsed: {
        index: number;
        id?: string;
        name?: string;
        argumentsDelta?: string;
      } = {
        index: rawToolCall.index,
      };

      if (typeof rawToolCall.id === "string") {
        parsed.id = rawToolCall.id;
      }

      if (typeof rawToolCall.function?.name === "string") {
        parsed.name = rawToolCall.function.name;
      }

      if (typeof rawToolCall.function?.arguments === "string") {
        parsed.argumentsDelta = rawToolCall.function.arguments;
      }

      toolCalls.push(parsed);
    }

    if (toolCalls.length > 0) {
      return {
        type: "tool_call_delta",
        toolCalls,
      };
    }
  }


  const content =
    choice.delta?.content;


  /**
   * content 有可能是：
   *
   * undefined
   * null
   * ""
   *
   * 这些都不需要产生 text_delta。
   */
  if (
    typeof content !== "string"
    || content.length === 0
  ) {
    return {
      type: "ignore",
    };
  }


  return {
    type: "text_delta",
    delta: content,
  };
}


type OpenAIUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;

  // OpenAI 的写法
  prompt_tokens_details?: {
    cached_tokens?: number;
  };

  // DeepSeek 的写法
  prompt_cache_hit_tokens?: number;
};


/**
 * 取出 chunk 里的 finish_reason。
 * 只用它来识别 "length"（输出被截断）；其余情况仍按有没有 tool call 判断。
 */
export function extractFinishReason(
  data: string,
): string | undefined {
  if (data === "[DONE]") {
    return undefined;
  }

  try {
    const chunk = JSON.parse(data) as {
      choices?: Array<{ finish_reason?: string | null }>;
    };

    const reason = chunk.choices?.[0]?.finish_reason;

    return typeof reason === "string" ? reason : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 单独提取 usage，不改动 parseOpenAIStreamData：
 * usage chunk 的 choices 通常是空数组，会被那边当成 ignore。
 */
export function extractOpenAIUsage(
  data: string,
): Usage | undefined {
  if (data === "[DONE]") {
    return undefined;
  }

  let chunk: {
    usage?: OpenAIUsage | null;
  };

  try {
    chunk = JSON.parse(data) as {
      usage?: OpenAIUsage | null;
    };
  } catch {
    return undefined;
  }

  const raw = chunk.usage;

  if (
    !raw
    || typeof raw.prompt_tokens !== "number"
    || typeof raw.completion_tokens !== "number"
  ) {
    return undefined;
  }

  const usage: Usage = {
    input: raw.prompt_tokens,
    output: raw.completion_tokens,
  };

  const cached =
    raw.prompt_tokens_details?.cached_tokens
    ?? raw.prompt_cache_hit_tokens;

  if (typeof cached === "number") {
    usage.cacheRead = cached;
  }

  return usage;
}


function finalizeToolCalls(
  pending: Map<
    number,
    {
      id?: string;
      name?: string;
      argumentsJson: string;
    }
  >,
): ToolCall[] {
  return [...pending.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, toolCall]) => {
      if (!toolCall.id || !toolCall.name) {
        throw new Error(
          `Incomplete tool call at index ${index}.`,
        );
      }

      let args: unknown;

      try {
        args = JSON.parse(toolCall.argumentsJson || "{}");
      } catch {
        throw new Error(
          `Invalid JSON arguments for tool: ${toolCall.name}`,
        );
      }

      if (
        typeof args !== "object"
        || args === null
        || Array.isArray(args)
      ) {
        throw new Error(
          `Tool arguments must be an object: ${toolCall.name}`,
        );
      }

      return {
        type: "toolCall",
        id: toolCall.id,
        name: toolCall.name,
        arguments: args as Record<string, unknown>,
      };
    });
}



// Provider 收到模型 SSE
//   → createAssistantMessage 组装统一消息
//   → Provider 把消息包装进事件流
//   → Agent Loop 读取事件
//   → Agent Loop 从最终消息里检查文本或 toolCall
function createAssistantMessage(
  model: Model,
  text: string,
  stopReason:
    | "stop"
    | "length"
    | "toolUse"
    | "error"
    | "aborted" = "stop",
  errorMessage?: string,
  toolCalls: ToolCall[] = [],
): AssistantMessage {
  const message: AssistantMessage = {
    role: "assistant",

    content: [
      ...(
        text.length > 0 || toolCalls.length === 0
          ? [{ type: "text" as const, text }]
          : []
      ),
      ...toolCalls,
    ],

    provider: model.provider,
    model: model.id,

    stopReason,

    timestamp: Date.now(),
  };


  /**
   * exactOptionalPropertyTypes 开启后，
   * 不应该写：
   *
   * errorMessage: undefined
   *
   * 所以只有真正存在时才添加。
   */
  if (errorMessage !== undefined) {
    message.errorMessage =
      errorMessage;
  }


  return message;
}
````

### `src/ai/types.ts`

````typescript
import Type from "typebox";

export type TextContent = {
  type: "text";
  text: string;
};


export type ToolCall = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};


export type SystemMessage = {
  role: "system";
  content: string;
  timestamp: number;
};


export type UserMessage = {
  role: "user";
  content: string | TextContent[];
  timestamp: number;
};


export type Usage = {
  /** 本次请求的输入 token，约等于整个 Context 的大小 */
  input: number;

  output: number;

  /** 输入中命中 Provider 前缀缓存的部分（Provider 返回了才有） */
  cacheRead?: number;
};


export type AssistantMessage = {
  role: "assistant";
  content: Array<TextContent | ToolCall>;

  provider: string;
  model: string;

  stopReason:
    | "stop"
    | "length"
    | "toolUse"
    | "error"
    | "aborted";

  errorMessage?: string;

  /**
   * Provider 返回了用量才有；
   * Fake 消息和错误消息没有。
   */
  usage?: Usage;

  timestamp: number;
};


 // 默认值：如果没指定具体 Schema，就先按普通 TSchema 处理
export type Tool<
  TParameters extends Type.TSchema =
    Type.TSchema,
> = {
  name: string;

  description: string;

  parameters: TParameters;
};
// TParameters 是一个泛型参数，但它必须是一种 TypeBox Schema。


export type ToolResultMessage = {
  role: "toolResult";

  toolCallId: string;
  toolName: string;

  content: TextContent[];

  isError: boolean;

  timestamp: number;
};

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolResultMessage;


export type Context = {
  /**
   * 不属于 transcript：
   * 每次请求时由 Provider 放到消息最前面。
   */
  systemPrompt?: string;

  messages: Message[];
};

export type SimpleStreamOptions = {
  /** 输出上限；Provider 发送为 max_tokens。不传则用模型默认值。 */
  maxTokens?: number;

  signal?: AbortSignal;

  /*
   * Provider 能看到的 Tool 定义。
   *
   * 注意这里只是 Tool，
   * 没有 AgentTool.execute()。
   */
  tools?: Tool[];
};

export type Model = {
  id: string;
  provider: string;
  name: string;

  contextWindow: number;
  maxTokens: number;
};


export type AssistantMessageEvent =
  | {
      type: "start";
      partial: AssistantMessage;
    }
  | {
      type: "text_delta";
      contentIndex: number;
      delta: string;
      partial: AssistantMessage;
    }
  | {
      type: "done";
      reason: "stop" | "length" | "toolUse";
      message: AssistantMessage;
    }
  | {
      type: "error";
      reason: "error" | "aborted";
      error: AssistantMessage;
    };


// AssistantMessageEventStream 是一个异步事件流，里面会陆续产生 AssistantMessageEvent。
export interface AssistantMessageEventStream
  extends AsyncIterable<AssistantMessageEvent> {
}
// 异步可迭代对象，简称异步迭代器集合
````

### `src/context/compaction.ts`

````typescript
import type {
  AgentMessage,
  StreamFn,
} from "../agent/types.js";

import type {
  AssistantMessage,
  Context,
  Model,
  TextContent,
  ToolCall,
  Usage,
  UserMessage,
} from "../ai/types.js";

import {
  estimateContextTokens,
  estimateMessageTokens,
  textOf,
} from "./token-estimate.js";


// ---------- 切点 ----------

export type CutPoint = {
  /**最终确定的近期消息起点 */
  firstKeptIndex: number;

  /**
   * 被切开的那一轮的起始 user 消息下标（原样保留）。
   * 切点本身就是 user 消息（没有切开一轮）时为 -1。
   */
  turnStartIndex: number;
};


/**
 * 合法切点：user 或 assistant 消息。
 * 绝不停在 toolResult 上：它必须跟着自己的 toolCall。
 * 停在带 toolCall 的 assistant 上时，它的 toolResult 在后面，会一起保留。
 */
function isCutPoint(
  message: AgentMessage,
): boolean {
  return (
    message.role === "user"
    || message.role === "assistant"
  );
}


/**
 * 从最新的消息往前累加估算的 token，
 * 凑够 keepRecentTokens 后，在最近的合法切点处切开。
 *
 * startIndex：这次最早可以总结到哪（多次压缩时是上一次的 firstKeptIndex）。
 * 返回的 firstKeptIndex <= startIndex 表示没什么可压缩的。
 */
export function findCutPoint(
  messages: AgentMessage[],
  startIndex: number,
  keepRecentTokens: number,
): CutPoint {
  let accumulated = 0;
  let firstKeptIndex = startIndex;

  for (let index = messages.length - 1; index >= startIndex; index -= 1) {
    const message = messages[index];

    if (!message) {
      continue;
    }

    accumulated += estimateMessageTokens(message);

    if (accumulated < keepRecentTokens) {
      continue;
    }

    // 优先往后找：保留的量尽量贴近预算
    let cut = index;

    while (
      cut < messages.length
      && !isCutPoint(messages[cut] as AgentMessage)
    ) {
      cut += 1;
    }

    // 后面找不到（结尾全是 toolResult）就往前找：多留一点，也不能切在 toolResult 上
    if (cut >= messages.length) {
      cut = index;

      while (
        cut > startIndex
        && !isCutPoint(messages[cut] as AgentMessage)
      ) {
        cut -= 1;
      }
    }

    firstKeptIndex = cut;
    break;
  }

  const kept = messages[firstKeptIndex];

  if (!kept || kept.role === "user") {
    return {
      firstKeptIndex,
      turnStartIndex: -1,
    };
  }

  // 切在一轮中间：找到这一轮开头的 user 消息
  let turnStartIndex = -1;

  for (let index = firstKeptIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      turnStartIndex = index;
      break;
    }
  }

  return {
    firstKeptIndex,
    turnStartIndex,
  };
}


// ---------- 序列化 ----------

/** 每一块内容序列化时的字符上限（Pi 对工具结果用的是 2000） */
const MAX_BLOCK_CHARS = 2000;


function clip(
  text: string,
): string {
  if (text.length <= MAX_BLOCK_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_BLOCK_CHARS)}\n[... ${text.length - MAX_BLOCK_CHARS} more characters truncated]`;
}


/**
 * 把消息序列化成纯文本，交给模型总结。
 *
 * 序列化而不是直接把消息发过去：
 * 否则模型会把它当成对话接着往下写，而不是总结它。
 */
export function serializeConversation(
  messages: AgentMessage[],
): string {
  const blocks: string[] = [];

  for (const message of messages) {
    switch (message.role) {
      case "system":
        blocks.push(`[System]: ${clip(message.content)}`);
        break;

      case "user":
        blocks.push(`[User]: ${clip(textOf(message.content))}`);
        break;

      case "assistant": {
        const text = message.content
          .filter((item): item is TextContent => item.type === "text")
          .map((item) => item.text)
          .join("");

        if (text.length > 0) {
          blocks.push(`[Assistant]: ${clip(text)}`);
        }

        const calls = message.content
          .filter((item): item is ToolCall => item.type === "toolCall")
          .map((call) => `${call.name}(${JSON.stringify(call.arguments)})`);

        if (calls.length > 0) {
          blocks.push(`[Assistant tool calls]: ${clip(calls.join("; "))}`);
        }

        break;
      }

      case "toolResult":
        blocks.push(
          `[${message.isError ? "Tool error" : "Tool result"}] ${message.toolName}: ${clip(textOf(message.content))}`,
        );
        break;
    }
  }

  return blocks.join("\n\n");
}



// ---------- 压缩器 ----------

export type CompactionSettings = {
  /** 模型的上下文窗口 */
  contextWindow: number;

  /** 给模型回答预留的空间（Pi 默认 16384） */
  reserveTokens: number;

  /** 压缩后保留原文的最近消息量（Pi 默认 20000） */
  keepRecentTokens: number;

  /** 写进 prompt 的总结目标（软约束），默认 0.4 × reserveTokens */
  maxSummaryTokens?: number;

  /** 总结请求的输出上限（max_tokens），默认 0.8 × reserveTokens */
  maxSummaryOutputTokens?: number;
};


export type CompactionEvent = {
  tokensBefore: number;
  estimatedTokensAfter: number;
  summarizedMessages: number;
  keptMessages: number;
  /** 模型写的总结（不含文件列表） */
  summary: string;
  usage?: Usage;
};


export type CompactorOptions = {
  model: Model;
  streamFn: StreamFn;
  settings: CompactionSettings;
  /** 每次调用模型前报告估算值，用来和随后真实的 in= 对照 */
  onEstimate?: (tokens: number, threshold: number) => void;
  onCompaction?: (event: CompactionEvent) => void;
  onError?: (error: unknown) => void;
};


export type Compactor = {
  transformContext(
    messages: AgentMessage[],
    signal?: AbortSignal,
  ): Promise<AgentMessage[]>;
};


type CompactionState = {
  /** 模型写的总结（不含文件列表），下次压缩时作为 previous-summary */
  modelSummary: string;

  /** 放进视图的总结消息：每次压缩只生成一次，保持同一个对象 */
  summaryMessage: UserMessage;

  firstKeptIndex: number;
  turnStartIndex: number;

  /** 压缩时 transcript 的长度：只有这之后的 usage 可信 */
  trustUsageFrom: number;

  readFiles: Set<string>;
  modifiedFiles: Set<string>;
};


const SUMMARIZER_SYSTEM_PROMPT =
  "You write context checkpoints for a coding agent. You are given a transcript of earlier work. Do not continue the conversation and do not call tools. Output only the checkpoint.";

const CHECKPOINT_SECTIONS = `## Goal
## Constraints & Preferences
## Progress
### Done
### In Progress
### Blocked
## Key Decisions
## Next Steps
## Critical Context`;

// C4 真实运行发现的两个问题：
// 1. 只记了"读过哪些文件"，没记"每个文件是做什么的"这类已得出的结论
// 2. 把序列化时加的截断标记，误当成"文件没读完、需要补读"
const CHECKPOINT_RULES = `Record findings and intermediate results the agent has already produced (for example, what each file it read does), not just which files were read: after this checkpoint the original tool outputs are no longer visible.
Tool outputs inside <conversation> may be shortened for this summary request only (marked "[... N more characters truncated]"). Do not conclude from these markers that the agent saw incomplete content or needs to re-read a file.
Keep exact file paths, function names, commands and error messages. The original request stays in the context verbatim, so do not copy it. Write in the same language as the original request.`;

const SUMMARY_INSTRUCTIONS = `Write a structured checkpoint of the work in <conversation> that another model will use to continue the task. Use exactly these sections:

${CHECKPOINT_SECTIONS}

Be concise.
${CHECKPOINT_RULES}`;

const UPDATE_INSTRUCTIONS = `<conversation> contains NEW messages. Update the checkpoint in <previous-summary>: keep what is still relevant, add new progress, findings and decisions, move finished items to Done, and refresh Next Steps. Use the same sections:

${CHECKPOINT_SECTIONS}

${CHECKPOINT_RULES}`;


const READ_TOOLS = new Set(["read_file"]);
const WRITE_TOOLS = new Set(["write_file", "edit_file"]);


function collectFiles(
  messages: AgentMessage[],
  readFiles: Set<string>,
  modifiedFiles: Set<string>,
): void {
  // 先收集成功执行的工具调用 ID。
  const succeeded = new Set<string>();

  for (const message of messages) {
    if (message.role === "toolResult" && !message.isError) {
      succeeded.add(message.toolCallId);
    }
  }

  // 再找到这些调用，从参数中提取文件路径。
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const item of message.content) {
      if (item.type !== "toolCall" || !succeeded.has(item.id)) {
        continue;
      }

      const path = item.arguments.path;

      if (typeof path !== "string") {
        continue;
      }

      if (READ_TOOLS.has(item.name)) {
        readFiles.add(path);
      }

      if (WRITE_TOOLS.has(item.name)) {
        modifiedFiles.add(path);
      }
    }
  }
}


function createSummaryMessage(
  input: {
    modelSummary: string;
    readFiles: Set<string>;
    modifiedFiles: Set<string>;
  },
): UserMessage {
  const modified = [...input.modifiedFiles];

  const read = [...input.readFiles].filter(
    (path) => !input.modifiedFiles.has(path),
  );

  const parts = [
    "The earlier part of this task was compacted to save context. Below is a checkpoint of the work so far; the most recent messages follow it unchanged.",
    `<summary>\n${input.modelSummary}\n</summary>`,
  ];

  if (read.length > 0) {
    parts.push(`<read-files>\n${read.join("\n")}\n</read-files>`);
  }

  if (modified.length > 0) {
    parts.push(`<modified-files>\n${modified.join("\n")}\n</modified-files>`);
  }

  parts.push(
    "File contents shown before this point are no longer visible. Read a file again before editing it.",
  );

  return {
    role: "user",
    content: parts.join("\n\n"),
    timestamp: Date.now(),
  };
}


function sumTokens(
  messages: AgentMessage[],
): number {
  return messages.reduce(
    (sum, message) => sum + estimateMessageTokens(message),
    0,
  );
}


function addUsage(
  total: Usage | undefined,
  next: Usage,
): Usage {
  if (!total) {
    return next;
  }

  const hasCache =
    total.cacheRead !== undefined
    || next.cacheRead !== undefined;

  return {
    input: total.input + next.input,
    output: total.output + next.output,
    ...(hasCache
      ? { cacheRead: (total.cacheRead ?? 0) + (next.cacheRead ?? 0) }
      : {}),
  };
}


export function createCompactor(
  options: CompactorOptions,
): Compactor {
  const { model, streamFn, settings } = options;

  const maxSummaryOutputTokens =
    settings.maxSummaryOutputTokens
    ?? Math.floor(0.8 * settings.reserveTokens);

  const maxSummaryTokens =
    settings.maxSummaryTokens
    ?? Math.floor(0.4 * settings.reserveTokens);

  let state: CompactionState | undefined;


  function buildView(
    messages: AgentMessage[],
  ): AgentMessage[] {
    const current = state;

    if (!current) {
      return messages;
    }

    const pinned =
      current.turnStartIndex >= 0
        ? messages[current.turnStartIndex]
        : undefined;

    return [
      ...(pinned ? [pinned] : []),
      current.summaryMessage,
      ...messages.slice(current.firstKeptIndex),
    ];
  }


  function estimateCurrent(
    messages: AgentMessage[],
    view: AgentMessage[],
  ): number {
    const trusted = estimateContextTokens(
      messages,
      state?.trustUsageFrom ?? 0,
    );

    if (!state || trusted.usageTokens > 0) {
      return trusted.tokens;
    }

    // 压缩后还没有新的模型调用：
    // 保留消息里的 usage 都是按压缩前的大 Context 统计的，不可信，全部按字符估算
    return sumTokens(view);
  }


  async function summarize(
    messages: AgentMessage[],
    originalRequest: string | undefined,
    previousSummary: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<{ text: string; usage?: Usage }> {
    const parts: string[] = [];

    if (originalRequest !== undefined) {
      parts.push(`<original-request>\n${originalRequest}\n</original-request>`);
    }

    parts.push(`<conversation>\n${serializeConversation(messages)}\n</conversation>`);

    if (previousSummary !== undefined) {
      parts.push(`<previous-summary>\n${previousSummary}\n</previous-summary>`);
    }

    parts.push(
      previousSummary !== undefined
        ? UPDATE_INSTRUCTIONS
        : SUMMARY_INSTRUCTIONS,
    );

    parts.push(
      `Keep the checkpoint under about ${maxSummaryTokens} tokens. Prioritize findings and remaining work; compress older details when updating.`,
    );

    let totalUsage: Usage | undefined;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const prompt =
        attempt === 1
          ? parts.join("\n\n")
          : `${parts.join("\n\n")}\n\nYour previous checkpoint was cut off at the output limit. Write a much shorter one: at most about ${Math.floor(maxSummaryTokens / 2)} tokens, one short line per item.`;

      // 不带 tools：总结请求不应该调用工具
      const context: Context = {
        systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: prompt,
            timestamp: Date.now(),
          },
        ],
      };

      const stream = await streamFn(
        model,
        context,
        {
          maxTokens: maxSummaryOutputTokens,
          ...(signal ? { signal } : {}),
        },
      );

      let final: AssistantMessage | undefined;

      for await (const event of stream) {
        if (event.type === "done") {
          final = event.message;
        } else if (event.type === "error") {
          final = event.error;
        }
      }

      if (final?.usage) {
        totalUsage = addUsage(totalUsage, final.usage);
      }

      if (
        !final
        || final.stopReason === "error"
        || final.stopReason === "aborted"
      ) {
        throw new Error(
          `Summarization failed: ${final?.errorMessage ?? "no response"}`,
        );
      }

      // 被截断的总结不完整，不能当检查点；先带着"写短一点"重试一次
      if (final.stopReason === "length") {
        if (attempt === 1) {
          continue;
        }

        throw new Error(
          "Summarization hit the output limit twice; the summary would be incomplete.",
        );
      }

      const text = final.content
        .filter((item): item is TextContent => item.type === "text")
        .map((item) => item.text)
        .join("")
        .trim();

      if (text.length === 0) {
        throw new Error("Summarization returned an empty summary.");
      }

      return {
        text,
        ...(totalUsage ? { usage: totalUsage } : {}),
      };
    }

    throw new Error("Summarization failed: no attempt succeeded.");
  }


  return {
    async transformContext(messages, signal) {
      const view = buildView(messages);
      const tokens = estimateCurrent(messages, view);

      const threshold =
        settings.contextWindow - settings.reserveTokens;

      options.onEstimate?.(tokens, threshold);

      if (tokens <= threshold) {
        return view;
      }

      const startIndex = state?.firstKeptIndex ?? 0;

      const cut = findCutPoint(
        messages,
        startIndex,
        settings.keepRecentTokens,
      );

      if (cut.firstKeptIndex <= startIndex) {
        return view;
      }

      // 被切开那一轮的开头 user 消息原样保留，不进总结
      const toSummarize = messages
        .slice(startIndex, cut.firstKeptIndex)
        .filter((_, offset) => startIndex + offset !== cut.turnStartIndex);

      if (toSummarize.length === 0) {
        return view;
      }

      const pinned =
        cut.turnStartIndex >= 0
          ? messages[cut.turnStartIndex]
          : undefined;

      try {
        const result = await summarize(
          toSummarize,
          pinned?.role === "user" ? textOf(pinned.content) : undefined,
          state?.modelSummary,
          signal,
        );

        const readFiles = new Set<string>(state?.readFiles);
        const modifiedFiles = new Set<string>(state?.modifiedFiles);

        collectFiles(toSummarize, readFiles, modifiedFiles);

        state = {
          modelSummary: result.text,
          summaryMessage: createSummaryMessage({
            modelSummary: result.text,
            readFiles,
            modifiedFiles,
          }),
          firstKeptIndex: cut.firstKeptIndex,
          turnStartIndex: cut.turnStartIndex,
          trustUsageFrom: messages.length,
          readFiles,
          modifiedFiles,
        };

        const newView = buildView(messages);

        options.onCompaction?.({
          summary: result.text,
          tokensBefore: tokens,
          estimatedTokensAfter: sumTokens(newView),
          summarizedMessages: toSummarize.length,
          keptMessages: messages.length - cut.firstKeptIndex,
          ...(result.usage ? { usage: result.usage } : {}),
        });

        return newView;
      } catch (error) {
        // 总结失败不终止任务：这次不压缩，照原样继续
        options.onError?.(error);
        return view;
      }
    },
  };
}
````

### `src/context/token-estimate.ts`

````typescript
import type {
  AgentMessage,
} from "../agent/types.js";

import type {
  TextContent,
} from "../ai/types.js";


/**
 * 粗估一段文本的 token 数。
 *
 * Pi 用 chars/4，对英文偏保守；但中文大约一个字符就是一个 token，
 * chars/4 会严重低估。所以 ASCII 按 /3，非 ASCII 按 1:1。
 * 准不准以真实 usage 校准为准。
 */
export function estimateTextTokens(
  text: string,
): number {
  let ascii = 0;
  let other = 0;

  for (const char of text) {
    if ((char.codePointAt(0) ?? 0) < 128) {
      ascii += 1;
    } else {
      other += 1;
    }
  }

  // C4 真实校准（DeepSeek）：代码类 ASCII 按 /4 会低估约 17%～22%，
  // 改成 /3，略微偏高，阈值判断宁早勿晚
  return Math.ceil(ascii / 3) + other;
}


export function textOf(
  content: string | TextContent[],
): string {
  return typeof content === "string"
    ? content
    : content.map((item) => item.text).join("");
}


export function estimateMessageTokens(
  message: AgentMessage,
): number {
  switch (message.role) {
    case "system":
    case "user":
    case "toolResult":
      return estimateTextTokens(textOf(message.content));
      // 这三个角色使用相同的处理逻辑，所以共用一个 return。

    // 它不仅能够包含普通文本，还能包含 ToolCall（工具调用）。
    case "assistant":
      return message.content.reduce(
        (sum, item) =>
          sum + (
            item.type === "text"
              ? estimateTextTokens(item.text)
              : estimateTextTokens(
                item.name + JSON.stringify(item.arguments),
              )
          ),
        0,
      );
  }
}


export type ContextEstimate = {
  /** 估算的 Context 总 token 数 */
  tokens: number;

  /** 来自 Provider 真实 usage 的部分（最后一次模型调用的 input + output） */
  usageTokens: number;

  /** 在那之后新增消息的估算部分 */
  trailingTokens: number;
};


/**
 * 估算当前 Context 大小：
 * 最后一条可信 assistant 消息的真实 usage + 它之后新增消息的估算。
 *
 * trustUsageFrom：只信任这个下标之后的 usage。
 * 压缩后保留下来的 assistant 消息，usage 是按压缩前的大 Context 统计的，
 * 不能再用（Pi 0.80.6 修过同样的问题）。
 */
export function estimateContextTokens(
  messages: AgentMessage[],
  trustUsageFrom = 0,
): ContextEstimate {
  for (let index = messages.length - 1; index >= trustUsageFrom; index -= 1) {
    const message = messages[index];

    if (
      message?.role === "assistant"
      && message.stopReason !== "error"
      && message.stopReason !== "aborted"
      && message.usage
      && message.usage.input > 0
    ) {
      const usageTokens =
        message.usage.input + message.usage.output;

      const trailingTokens = messages
        .slice(index + 1)
        .reduce((sum, item) => sum + estimateMessageTokens(item), 0);

      return {
        tokens: usageTokens + trailingTokens,
        usageTokens,
        trailingTokens,
      };
    }
  }

  // 没有可信 usage：全部靠估算
  const trailingTokens = messages.reduce(
    (sum, item) => sum + estimateMessageTokens(item),
    0,
  );

  return {
    tokens: trailingTokens,
    usageTokens: 0,
    trailingTokens,
  };
}
````

### `src/tools/edit-file.ts`

````typescript
import {
  readFile,
  writeFile,
} from "node:fs/promises";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";

import {
  assertNotSecretFile,
  resolveWorkspacePath,
} from "./workspace-path.js";


const editFileParameters =
  Type.Object(
    {
      path: Type.String({
        minLength: 1,
        description:
          "File path relative to the workspace root.",
      }),

      oldText: Type.String({
        minLength: 1,
        description:
          "Exact text to replace. Must match the file exactly, including whitespace and indentation, and must appear exactly once.",
      }),

      newText: Type.String({
        description:
          "Text that replaces oldText.",
      }),
    },
    {
      additionalProperties: false,
    },
  );


export type EditFileDetails = {
  path: string;

  /** 替换发生的起始行号（从 1 开始） */
  line: number;
};


function toLf(
  text: string,
): string {
  return text.replace(/\r\n/g, "\n");
}


function findAll(
  haystack: string,
  needle: string,
): number[] {
  const indexes: number[] = [];

  let index = haystack.indexOf(needle);

  while (index !== -1) {
    indexes.push(index);
    index = haystack.indexOf(needle, index + 1);
  }

  return indexes;
}


/**
 * 匹配位置所在行用的换行符。
 * 混合换行的文件里不同区域可能不同，所以按位置判断，不按整个文件。
 */
function lineEndingAt(
  content: string,
  index: number,
): "\n" | "\r\n" {
  const next = content.indexOf("\n", index);

  if (next !== -1) {
    return content[next - 1] === "\r" ? "\r\n" : "\n";
  }

  const previous = content.lastIndexOf("\n", index);

  if (previous !== -1) {
    return content[previous - 1] === "\r" ? "\r\n" : "\n";
  }

  return "\n";
}


/** 替换区域前后各展示多少行上下文 */
const CONTEXT_LINES = 3;

/** 返回给模型的片段字符上限，超出时截断并注明 */
export const MAX_SNIPPET_CHARS = 2000;


/**
 * 按行切分，兼容 CRLF：每行末尾的 "\r" 去掉，
 * 末尾换行不算一行（和 read_file 的处理保持一致）。
 */
function splitLines(
  text: string,
): string[] {
  const lines = text
    .split("\n")
    .map((line) =>
      line.endsWith("\r")
        ? line.slice(0, -1)
        : line,
    );

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}


export function createEditFileTool(
  workspaceRoot: string,
): AgentTool<
  typeof editFileParameters,
  EditFileDetails
> {
  return {
    name: "edit_file",

    label: "Edit File",

    description:
      "Replace one exact occurrence of oldText with newText in an existing UTF-8 file inside the workspace. Read the file first and copy oldText exactly. Include enough surrounding lines to make oldText unique. Prefer this over write_file when changing existing files.",

    parameters:
      editFileParameters,


    async execute(
      _toolCallId,
      parameters,
    ) {
      const {
        absolutePath,
        relativePath,
      } = resolveWorkspacePath(
        workspaceRoot,
        parameters.path,
      );

      if (relativePath === ".") {
        throw new Error(
          `Path is not a file: ${parameters.path}`,
        );
      }

      assertNotSecretFile(relativePath);

      const content =
        await readFile(absolutePath, "utf8");

      const oldLf = toLf(parameters.oldText);
      const newLf = toLf(parameters.newText);

      if (oldLf === newLf) {
        throw new Error(
          "oldText and newText are identical; nothing to change.",
        );
      }

      /*
       * 文件可能是 LF、CRLF 或混合：
       * oldText 的两种写法都试，在原始内容上匹配，
       * 只替换匹配到的那一段，其余字节原样保留。
       */
      const variants = [
        ...new Set([
          oldLf,
          oldLf.replace(/\n/g, "\r\n"),
        ]),
      ];

      const matches = variants.flatMap(
        (variant) =>
          findAll(content, variant).map(
            (index) => ({
              index,
              text: variant,
            }),
          ),
      );

      const [match, ...others] = matches;

      if (!match) {
        throw new Error(
          `oldText not found in ${relativePath}. Read the file again and copy the exact text, including whitespace and indentation.`,
        );
      }

      if (others.length > 0) {
        throw new Error(
          `oldText appears more than once in ${relativePath}. Include more surrounding lines to make it unique.`,
        );
      }

      // 新插入的内容跟随匹配位置那一行的换行符
      const replacement = newLf.replace(
        /\n/g,
        lineEndingAt(content, match.index),
      );

      /*
       * 不用 String.replace：
       * newText 里的 "$&"、"$1"、"$$" 会被当成替换模式。
       */
      const updated =
        content.slice(0, match.index)
        + replacement
        + content.slice(match.index + match.text.length);

      await writeFile(absolutePath, updated, "utf8");

      const line =
        content.slice(0, match.index).split("\n").length;

      /*
       * 回显修改后的区域（含前后各 CONTEXT_LINES 行），
       * 让模型能确认改对了，不必再读一遍文件。
       * 逐行不加行号前缀，避免模型把行号当成文件内容复制。
       */
      const lines = splitLines(updated);
      const totalLines = lines.length;

      const endLine =
        updated
          .slice(0, match.index + replacement.length)
          .split("\n").length;

      const fromLine = Math.max(1, line - CONTEXT_LINES);
      const toLine = Math.min(
        totalLines,
        endLine + CONTEXT_LINES,
      );

      const snippetLines =
        lines.slice(fromLine - 1, toLine);

      let snippet = snippetLines.join("\n");
      let truncated = false;

      if (snippet.length > MAX_SNIPPET_CHARS) {
        snippet = snippet.slice(0, MAX_SNIPPET_CHARS);
        truncated = true;
      }

      const header =
        `[lines ${fromLine}-${toLine} of ${totalLines}]`;

      const suffix = truncated
        ? `\n… [snippet truncated to ${MAX_SNIPPET_CHARS} characters]`
        : "";

      return {
        content: [
          {
            type: "text",
            text:
              `Edited ${relativePath} at line ${line}.\n\n`
              + `${header}\n${snippet}${suffix}`,
          },
        ],

        details: {
          path: relativePath,
          line,
        },
      };
    },
  };
}
````

### `src/tools/list-directory.ts`

````typescript
import {
  readdir,
} from "node:fs/promises";

import {
  resolve,
} from "node:path";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";

import {
  resolveWorkspacePath,
} from "./workspace-path.js";


const listDirectoryParameters =
  Type.Object(
    {
      path:
        Type.Optional(
          Type.String({
            minLength: 1,
          }),
        ),
    },
    {
      additionalProperties: false,
    },
  );


export type ListDirectoryDetails = {
  path: string;

  entries: Array<{
    name: string;
    type:
      | "file"
      | "directory"
      | "other";
  }>;
};


export function createListDirectoryTool(
  workspaceRoot: string,
): AgentTool<
  typeof listDirectoryParameters,
  ListDirectoryDetails
> {
  const root =
    resolve(workspaceRoot);


  return {
    name:
      "list_directory",

    label:
      "List Directory",

    description:
      "List files and directories inside the workspace. Use path '.' to list the workspace root.",

    parameters:
      listDirectoryParameters,


    async execute(
      _toolCallId,
      parameters,
    ) {
      const requestedPath =
        parameters.path ?? ".";


      const {
        absolutePath,
        relativePath,
      } = resolveWorkspacePath(
        root,
        requestedPath,
      );


      const directoryEntries =
        await readdir(
          absolutePath,
          {
            withFileTypes: true,
          },
        );


      const entries =
        directoryEntries
          .map((entry) => ({
            name:
              entry.name,

            type:
              entry.isDirectory()
                ? "directory" as const
                : entry.isFile()
                  ? "file" as const
                  : "other" as const,
          }))
          .sort(
            (left, right) => {
              /*
               * directory 优先，
               * 然后按名字排序。
               */
              if (
                left.type
                !== right.type
              ) {
                if (
                  left.type
                  === "directory"
                ) {
                  return -1;
                }

                if (
                  right.type
                  === "directory"
                ) {
                  return 1;
                }
              }

              return left.name.localeCompare(
                right.name,
              );
            },
          );


      const text =
        entries
          .map((entry) => {
            const prefix =
              entry.type
              === "directory"
                ? "[DIR]"
                : entry.type
                  === "file"
                    ? "[FILE]"
                    : "[OTHER]";

            return `${prefix} ${entry.name}`;
          })
          .join("\n");


      return {
        content: [
          {
            type: "text",

            text:
              text.length > 0
                ? text
                : "(empty directory)",
          },
        ],

        details: {
          path:
            relativePath,

          entries,
        },
      };
    },
  };
}
````

### `src/tools/read-file.ts`

````typescript
import {
  readFile,
} from "node:fs/promises";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";

import {
  assertNotSecretFile,
  resolveWorkspacePath,
} from "./workspace-path.js";


const DEFAULT_LINE_LIMIT = 500;
const MAX_LINE_LIMIT = 2000;
const MAX_OUTPUT_CHARS = 30_000;


const readFileParameters =
  Type.Object(
    {
      path: Type.String({
        minLength: 1,
        description:
          "File path relative to the workspace root.",
      }),

      offset: Type.Optional(
        Type.Integer({
          minimum: 1,
          description:
            "Line number to start reading from (1-based). Default 1.",
        }),
      ),

      limit: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: MAX_LINE_LIMIT,
          description:
            `Maximum number of lines to return. Default ${DEFAULT_LINE_LIMIT}.`,
        }),
      ),
    },
    {
      additionalProperties: false,
    },
  );


//content
// → 给 LLM
//
// details
// → 给 Runtime / Trace / Extension
export type ReadFileDetails = {
  path: string;
  bytes: number;
  totalLines: number;
  startLine: number;
  endLine: number;
};


export function createReadFileTool(
  workspaceRoot: string,
): AgentTool<
  typeof readFileParameters,
  ReadFileDetails
> {
  return {
    name: "read_file",

    label: "Read File",

    description:
      `Read a UTF-8 text file inside the workspace. The path must be relative to the workspace root. Returns at most ${DEFAULT_LINE_LIMIT} lines per call by default; use offset and limit to read other parts of large files.`,

    parameters:
      readFileParameters,


    async execute(
      _toolCallId,
      parameters,
    ) {
      const {
        absolutePath,
        relativePath,
      } = resolveWorkspacePath(
        workspaceRoot,
        parameters.path,
      );

      if (relativePath === ".") {
        throw new Error(
          `Path is not a file: ${parameters.path}`,
        );
      }

      assertNotSecretFile(relativePath);

      const buffer =
        await readFile(absolutePath);

      if (buffer.includes(0)) {
        throw new Error(
          `Binary file cannot be read as text: ${relativePath}`,
        );
      }

      const text =
        buffer.toString("utf8");

      /*
       * 按 "\n" 切：CRLF 文件每行末尾保留 "\r"，
       * join("\n") 后能还原原文。
       * 末尾换行不算一行。
       */
      const lines = text.split("\n");

      if (lines.at(-1) === "") {
        lines.pop();
      }

      const start =
        (parameters.offset ?? 1) - 1;

      if (start > 0 && start >= lines.length) {
        throw new Error(
          `offset ${start + 1} is beyond the end of ${relativePath} (${lines.length} lines).`,
        );
      }

      const limit =
        parameters.limit ?? DEFAULT_LINE_LIMIT;

      // 行数和字符数，先到哪个上限就停在哪
      const selected: string[] = [];
      let chars = 0;

      for (const line of lines.slice(start, start + limit)) {
        if (
          selected.length > 0
          && chars + line.length + 1 > MAX_OUTPUT_CHARS
        ) {
          break;
        }

        selected.push(line);
        chars += line.length + 1;
      }

      const end =
        start + selected.length;

      const partial =
        start > 0 || end < lines.length;

      let output: string;

      if (!partial) {
        // 整个文件：原样返回
        output = text;
      } else {
        let body = selected.join("\n");

        // 单行本身就超长（例如压缩后的代码）
        if (body.length > MAX_OUTPUT_CHARS) {
          body = `${body.slice(0, MAX_OUTPUT_CHARS)}…`;
        }

        const more =
          end < lines.length
            ? `; use offset=${end + 1} to read more`
            : "";

        output =
          `${body}\n\n[showing lines ${start + 1}-${end} of ${lines.length}${more}]`;
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],

        details: {
          path: relativePath,
          bytes: buffer.length,
          totalLines: lines.length,
          startLine: start + 1,
          endLine: end,
        },
      };
    },
  };
}
````

### `src/tools/run-command.ts`

````typescript
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

// 内存里最多保留的尾部字节数，防止刷屏命令撑爆内存
const MAX_BUFFERED_BYTES = 400_000;

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


function createFallbackDecoder(): TextDecoder {
  if (process.platform === "win32") {
    try {
      // 中文 Windows 控制台代码页（936）
      return new TextDecoder("gbk");
    } catch {
      // Node 没带完整 ICU 时不支持 gbk
    }
  }

  // 非严格模式：解不了的字节变成 �，不会抛错
  return new TextDecoder("utf-8");
}


/**
 * 按行解码：每行先严格按 UTF-8 解码，失败再用回退编码。
 *
 * 按行而不是整段判断：同一次命令的输出可能混着
 * UTF-8（node、git）和 GBK（cmd 自带命令）。
 * "\n"（0x0A）在 UTF-8 和 GBK 里都不会出现在多字节字符内部，
 * 所以按字节切行是安全的。
 */
export function decodeOutput(
  buffer: Buffer,
): string {
  const utf8 = new TextDecoder("utf-8", {
    fatal: true,
  });

  const fallback = createFallbackDecoder();
  const lines: string[] = [];

  let start = 0;

  while (start <= buffer.length) {
    let end = buffer.indexOf(0x0a, start);

    if (end === -1) {
      end = buffer.length;
    }

    const line = buffer.subarray(start, end);

    try {
      lines.push(utf8.decode(line));
    } catch {
      lines.push(fallback.decode(line));
    }

    start = end + 1;
  }

  return lines.join("\n");
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
      `Run a shell command in the workspace root and return its combined stdout/stderr and exit code. Use it to run tests, builds, git and other CLI tools. The shell is ${SHELL_NAME}. stdout and stderr are already combined, so do not add 2>&1, 2>nul or pipes to pagers like more. Run one command per call instead of chaining commands with & or &&. Commands cannot read interactive input. Long output is truncated to the last ${MAX_OUTPUT_LINES} lines.`,

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

      const buffered = Buffer.concat(chunks);
      const droppedHead = totalBytes > buffered.length;

      // 头部被丢过的话，第一行可能是半行（甚至半个字符），整行丢掉
      let raw = buffered;

      if (droppedHead) {
        const firstNewline = buffered.indexOf(0x0a);

        if (firstNewline !== -1) {
          raw = buffered.subarray(firstNewline + 1);
        }
      }

      const tail = truncateTail(
        decodeOutput(raw).replace(/\r\n/g, "\n"),
        MAX_OUTPUT_LINES,
        MAX_OUTPUT_CHARS,
      );

      const truncated =
        tail.truncated || droppedHead;

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
````

### `src/tools/search-text.ts`

````typescript
import {
  readdir,
  readFile,
  stat,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";

import {
  assertNotSecretFile,
  isSecretFile,
  resolveWorkspacePath,
} from "./workspace-path.js";


const IGNORED_DIRECTORIES =
  new Set([".git", "node_modules", "dist"]);

const MAX_MATCHES = 100;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_LINE_LENGTH = 200;


const searchTextParameters =
  Type.Object(
    {
      pattern: Type.String({
        minLength: 1,
        description:
          "Text to search for. Plain text by default; set regex to true to use a JavaScript regular expression.",
      }),

      path: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "File or directory relative to the workspace root. Defaults to the whole workspace.",
        }),
      ),

      regex: Type.Optional(
        Type.Boolean({
          description:
            "Treat pattern as a JavaScript regular expression.",
        }),
      ),

      ignoreCase: Type.Optional(
        Type.Boolean({
          description:
            "Case-insensitive search.",
        }),
      ),
    },
    {
      additionalProperties: false,
    },
  );


export type SearchMatch = {
  path: string;
  line: number;
  text: string;
};


export type SearchTextDetails = {
  matches: SearchMatch[];
  filesSearched: number;
  truncated: boolean;
};


type WorkspaceFile = {
  absolutePath: string;
  relativePath: string;
};


function escapeRegExp(
  text: string,
): string {
  // 这里是故意用 $&：把每个特殊字符替换成"\ + 它自己"
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


// async function* 合起来叫异步生成器：它既能 await，又能逐个返回结果。
async function* walkFiles(
  absoluteDirectory: string,
  relativeDirectory: string,
): AsyncGenerator<WorkspaceFile> {
  const entries = await readdir(
    absoluteDirectory,
    {
      withFileTypes: true,
    },
  );

  // 固定顺序，结果可复现
  entries.sort(
    (left, right) => left.name.localeCompare(right.name),
  );

  for (const entry of entries) {
    const absolutePath =
      join(absoluteDirectory, entry.name);

    const relativePath =
      relativeDirectory === "."
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;

    /*
     * 符号链接既不是 isDirectory() 也不是 isFile()：
     * 直接跳过，不跟进，避免遍历到 workspace 外。
     */
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        yield* walkFiles(absolutePath, relativePath);
      }
    } else if (entry.isFile()) {
      if (isSecretFile(entry.name)) {
        continue;
      }

      yield {
        absolutePath,
        relativePath,
      };
    }
  }
}


export function createSearchTextTool(
  workspaceRoot: string,
): AgentTool<
  typeof searchTextParameters,
  SearchTextDetails
> {
  return {
    name: "search_text",

    label: "Search Text",

    description:
      "Search file contents in the workspace and return matching lines as path:line: text. Use this to find where something is defined or used when you do not know which file it is in. Skips .git, node_modules, dist and binary files.",

    parameters:
      searchTextParameters,


    async execute(
      _toolCallId,
      parameters,
      signal,
    ) {
      const {
        absolutePath,
        relativePath,
      } = resolveWorkspacePath(
        workspaceRoot,
        parameters.path ?? ".",
      );

      assertNotSecretFile(relativePath);

      let matcher: RegExp;

      try {
        matcher = new RegExp(
          parameters.regex
            ? parameters.pattern
            : escapeRegExp(parameters.pattern),
          parameters.ignoreCase ? "i" : "",
        );
      } catch {
        throw new Error(
          `Invalid regular expression: ${parameters.pattern}`,
        );
      }

      const target =
        await stat(absolutePath);

      const files:
        | WorkspaceFile[]
        | AsyncGenerator<WorkspaceFile> =
        target.isFile()
          ? [{ absolutePath, relativePath }]
          : walkFiles(absolutePath, relativePath);

      const matches: SearchMatch[] = [];
      let filesSearched = 0;
      let truncated = false;

      search:
      for await (const file of files) {
        signal?.throwIfAborted();

        const info =
          await stat(file.absolutePath);

        if (info.size > MAX_FILE_BYTES) {
          continue;
        }

        const buffer =
          await readFile(file.absolutePath);

        // 含 NUL 字节：按二进制文件跳过
        if (buffer.includes(0)) {
          continue;
        }

        filesSearched += 1;

        const lines =
          buffer.toString("utf8").split(/\r?\n/);

        for (const [index, line] of lines.entries()) {
          if (!matcher.test(line)) {
            continue;
          }

          if (matches.length >= MAX_MATCHES) {
            truncated = true;
            break search;
          }

          matches.push({
            path: file.relativePath,
            line: index + 1,
            text:
              line.length > MAX_LINE_LENGTH
                ? `${line.slice(0, MAX_LINE_LENGTH)}…`
                : line,
          });
        }
      }

      const outputLines = matches.map(
        (match) =>
          `${match.path}:${match.line}: ${match.text}`,
      );

      if (truncated) {
        outputLines.push(
          `[results truncated: showing the first ${MAX_MATCHES} matches; narrow the pattern or path]`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text:
              matches.length === 0
                ? `No matches for "${parameters.pattern}" (${filesSearched} files searched).`
                : outputLines.join("\n"),
          },
        ],

        details: {
          matches,
          filesSearched,
          truncated,
        },
      };
    },
  };
}
````

### `src/tools/workspace-path.ts`

````typescript
import { lstatSync } from "node:fs";
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export type WorkspacePath = {
  absolutePath: string;
  relativePath: string;
};

export function resolveWorkspacePath(
  workspaceRoot: string,
  requestedPath: string,
): WorkspacePath {
  const root = resolve(workspaceRoot);
  const absolutePath = resolve(root, requestedPath);
  const relativePath = relative(root, absolutePath);

  if (
    relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
  ) {
    throw new Error(
      `Path is outside the workspace: ${requestedPath}`,
    );
  }

  // 不允许路径中的现有部分是符号链接，以免链接指向 workspace 外。
  let current = root;

  for (const part of relativePath.split(sep)) {
    current = join(current, part);

    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(
          `Path contains a symbolic link: ${requestedPath}`,
        );
      }
    } catch (error) {
      if (
        error instanceof Error
        && "code" in error
        && error.code === "ENOENT"
      ) {
        break; // write-file.ts 可创建后续尚不存在的目录。
      }

      throw error;
    }
  }

  return {
    absolutePath,
    relativePath:
      relativePath === ""
        ? "."
        : relativePath.split(sep).join("/"),
  };
}

/**
 * .env / .env.local / .env.production 等可能含 Key；
 * .env.example / .sample / .template 是模板，不算。
 */
export function isSecretFile(
  relativePath: string,
): boolean {
  const name =
    relativePath.split("/").at(-1) ?? "";

  return (
    /^\.env(\..+)?$/.test(name)
    && !/\.(example|sample|template)$/.test(name)
  );
}


export function assertNotSecretFile(
  relativePath: string,
): void {
  if (isSecretFile(relativePath)) {
    throw new Error(
      `Access to ${relativePath} is blocked because it may contain secrets. Do not try to read it another way (for example with run_command); if you need a value from it, ask the user.`,
    );
  }
}
````

### `src/tools/write-file.ts`

````typescript
import { statSync } from "node:fs";
import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import Type from "typebox";

import type { AgentTool } from "../agent/types.js";
import {
  assertNotSecretFile,
  resolveWorkspacePath,
} from "./workspace-path.js";

const writeFileParameters = Type.Object(
  {
    path: Type.String({
      minLength: 1,
      description:
        "File path relative to the workspace root.",
    }),
    content: Type.String({
      description:
        "Complete UTF-8 file content. Replaces an existing file.",
    }),
  },
  { additionalProperties: false },
);

export type WriteFileDetails = {
  path: string;
  bytes: number;
  created: boolean;
};

export function createWriteFileTool(
  workspaceRoot: string,
): AgentTool<
  typeof writeFileParameters,
  WriteFileDetails
> {
  return {
    name: "write_file",
    label: "Write File",
   description:
    "Create or completely overwrite a UTF-8 text file inside the workspace. Missing parent directories are created. To change part of an existing file, use edit_file.",
    parameters: writeFileParameters,

    async execute(_toolCallId, parameters) {
      const {
        absolutePath,
        relativePath,
      } = resolveWorkspacePath(
        workspaceRoot,
        parameters.path,
      );

      if (relativePath === ".") {
        throw new Error(
          `Path is not a file: ${parameters.path}`,
        );
      }

      assertNotSecretFile(relativePath);

      let created = false;

      try {
        if (!statSync(absolutePath).isFile()) {
          throw new Error(
            `Path is not a file: ${parameters.path}`,
          );
        }
      } catch (error) {
        if (
          error instanceof Error
          && "code" in error
          && error.code === "ENOENT"
        ) {
          created = true;
        } else {
          throw error;
        }
      }

      await mkdir(dirname(absolutePath), {
        recursive: true,
      });
      await writeFile(
        absolutePath,
        parameters.content,
        "utf8",
      );

      const bytes = Buffer.byteLength(
        parameters.content,
        "utf8",
      );

      return {
        content: [{
          type: "text",
          text:
            `${created ? "Created" : "Overwrote"} ${relativePath} (${bytes} bytes).`,
        }],
        details: {
          path: relativePath,
          bytes,
          created,
        },
      };
    },
  };
}
````

### `src/extensions/budget.ts`

````typescript
import type {
  AgentExtension,
} from "../agent/extension.js";

import type {
  AgentLoopHooks,
} from "../agent/hooks.js";


export type BudgetLimits = {
  maxModelCalls?: number;
  maxToolCalls?: number;
};


export type BudgetState = {
  modelCalls: number;
  toolCalls: number;
};


export type BudgetResource =
  | "model_calls"
  | "tool_calls";


// 这个类定义了一种专门表示“预算超限”的错误，方便程序识别超限原因。
export class BudgetExceededError extends Error {

  // readonly 表示 TypeScript 不允许之后重新给字段赋值。
  readonly resource: BudgetResource;
  readonly limit: number;

  constructor(
    resource: BudgetResource,
    limit: number,
  ) {
    // 调用父类 Error 的构造函数，设置错误消息。比如模型调用上限是 5，消息就是：
    super(
      `Budget exceeded: ${resource} limit is ${limit}.`,
    );

    this.name = "BudgetExceededError";
    this.resource = resource;
    this.limit = limit;
  }
}


export type BudgetExtension = AgentExtension & {
  getState(): BudgetState;
};


function assertLimit(
  name: string,
  value: number | undefined,
): void {
  if (
    value !== undefined
    && (
      !Number.isInteger(value)
      || value < 1
    )
  ) {
    throw new Error(
      `${name} must be a positive integer.`,
    );
  }
}


export function createBudgetExtension(
  limits: BudgetLimits,
): BudgetExtension {
  assertLimit(
    "maxModelCalls",
    limits.maxModelCalls,
  );

  assertLimit(
    "maxToolCalls",
    limits.maxToolCalls,
  );

  let modelCalls = 0;
  let toolCalls = 0;

  const hooks: AgentLoopHooks = {
    beforeModelCall() {
      if (
        limits.maxModelCalls !== undefined
        && modelCalls >= limits.maxModelCalls
      ) {
        throw new BudgetExceededError(
          "model_calls",
          limits.maxModelCalls,
        );
      }

      modelCalls += 1;
    },

    beforeToolCall() {
      if (
        limits.maxToolCalls !== undefined
        && toolCalls >= limits.maxToolCalls
      ) {
        return {
          block: true,
          reason:
            `Budget exceeded: tool_calls limit is ${limits.maxToolCalls}. No more tool calls will run in this task; finish now with the information you already have.`,
        };
      }

      toolCalls += 1;
    },
  };

  return {
    name: "budget",
    hooks,

    getState() {
      return {
        modelCalls,
        toolCalls,
      };
    },
  };
}
````

### `src/extensions/command-approval.ts`

````typescript
import type {
  AgentExtension,
} from "../agent/extension.js";

import type {
  BeforeToolCallResult,
} from "../agent/hooks.js";


export type ApproveCommand =
  (command: string) => Promise<boolean>;


export const DEFAULT_ALLOWED_COMMANDS = [
  "pnpm test",
  "pnpm typecheck",
  "pnpm build",
  "git status",
  "git diff",
  "git log",
  "git show",
];


// 能串联命令、重定向、展开变量的字符：出现任何一个都必须确认
const SHELL_METACHARACTERS = /[;&|<>`$()^%\r\n]/;


export function isAllowedCommand(
  command: string,
  allowed: readonly string[],
): boolean {
  if (SHELL_METACHARACTERS.test(command)) {
    return false;
  }

  const normalized =
    command.trim().replace(/\s+/g, " ");

  // git diff / log / show 的 --output 会写文件
  if (/--output\b/.test(normalized)) {
    return false;
  }

  return allowed.some(
    (prefix) =>
      normalized === prefix
      || normalized.startsWith(`${prefix} `),
  );
}


/**
 * 白名单之外的 run_command 需要人工确认。
 *
 * 不是安全隔离：白名单里的 pnpm test 会执行测试文件，
 * 模型可以先写文件再执行。它防的是意外，并让命令可见。
 */
export function createCommandApprovalExtension(
  options: {
    approve: ApproveCommand;
    allowed?: readonly string[];
  },
): AgentExtension {
  const allowed =
    options.allowed ?? DEFAULT_ALLOWED_COMMANDS;

  return {
    name: "command-approval",

    hooks: {
      async beforeToolCall({
        toolCall,
      }): Promise<BeforeToolCallResult | undefined> {
        if (toolCall.name !== "run_command") {
          return undefined;
        }

        // beforeToolCall 在参数校验之前运行，不能假设 command 是 string
        const command =
          toolCall.arguments.command;

        if (typeof command !== "string") {
          return undefined;
        }

        if (isAllowedCommand(command, allowed)) {
          return undefined;
        }

        if (await options.approve(command)) {
          return undefined;
        }

        return {
          block: true,
          reason:
            `The user rejected this command: ${command}. Do not retry it; use another approach or explain what you need.`,
        };
      },
    },
  };
}
````

### `src/logging/logger-extension.ts`

````typescript
import type {
  AgentExtension,
} from "../agent/extension.js";


export type LogSink =
  (message: string) => void;


export function createLoggerExtension(
  log: LogSink =
    console.log,
): AgentExtension {
  return {
    name: "logger",
    hooks: {
    onTurnStart({
      turnIndex,
    }) {
      log(
        `[turn ${turnIndex}] start`,
      );
    },


    beforeModelCall({
      callId,
      turnIndex,
      model,
      inputMessageCount,
    }) {
      log(
        [
          `[model start]`,
          `call=${callId}`,
          `turn=${turnIndex}`,
          `model=${model.id}`,
          `messages=${inputMessageCount}`,
        ].join(" "),
      );
    },


    afterModelCall({
      callId,
      turnIndex,
      message,
    }) {
      const usage = message.usage;

      log(
        [
          `[model end]`,
          `call=${callId}`,
          `turn=${turnIndex}`,
          `stopReason=${message.stopReason}`,
          ...(usage
            ? [
                `in=${usage.input}`,
                ...(usage.cacheRead !== undefined
                  ? [`cached=${usage.cacheRead}`]
                  : []),
                `out=${usage.output}`,
              ]
            : []),
        ].join(" "),
      );
    },


    beforeToolCall({
      turnIndex,
      toolCall,
    }) {
      log(
        [
          `[tool start]`,
          `turn=${turnIndex}`,
          `tool=${toolCall.name}`,
          `id=${toolCall.id}`,
          `args=${JSON.stringify(
            toolCall.arguments,
          )}`,
        ].join(" "),
      );
    },


    afterToolCall({
      turnIndex,
      toolCall,
      isError,
      errorMessage,
    }) {
      log(
        [
          `[tool end]`,
          `turn=${turnIndex}`,
          `tool=${toolCall.name}`,
          `error=${isError}`,
          ...(errorMessage
            ? [
                `message=${errorMessage}`,
              ]
            : []),
        ].join(" "),
      );
    },


    onTurnEnd({
      turnIndex,
    }) {
      log(
        `[turn ${turnIndex}] end`,
      );
    },


    onRunEnd({
      status,
    }) {
      log(
        `[run end] status=${status}`,
      );
    },
    },
  };
}
````

### `src/prompts/coding-system-prompt.ts`

````typescript
export function createCodingSystemPrompt(
  workspaceRoot: string,
): string {
  const os =
    process.platform === "win32"
      ? "Windows"
      : process.platform;

  return [
    "You are a coding agent working inside a local workspace.",
    "",
    `Workspace root: ${workspaceRoot}`,
    `Operating system: ${os}`,
    "File tool paths are relative to the workspace root. Commands run in the workspace root.",
    "",
    "How to work:",

    // 预防：模型声称成功但没有证据
    "- Tool results are facts about the environment. Never claim a command succeeded or a file contains something unless a tool result showed it.",

    // 观察：修 bug 任务先浏览了 7 次才跑测试
    "- When asked to fix failing tests or a failing build, run it first and let the failure output tell you where to look.",

    // 观察（Coding-3）：search_text 定位比逐层 list_directory 更快
    "- If you do not know where something is, use search_text instead of listing directories one by one.",

    // 预防：不读就改
    "- Read the relevant part of a file before editing it.",

    // 观察（Coding-2）：模型自己选对了 edit_file，这里明确下来
    "- Use edit_file for changes to existing files; use write_file only for new files or full rewrites.",

    // 观察：这次没有改测试，但这是最常见的作弊方式
    "- Keep changes minimal and focused on the task. Do not modify tests to make them pass unless asked.",

    // 观察：修复后自己重跑了测试，明确下来
    "- After changing code, run the relevant tests or build to verify.",

    // 观察：读了与任务无关的文件
    "- Be efficient: skip files that are irrelevant to the task. Call independent tools in the same turn.",

    // 观察：叙述用英文，结论用中文
    "- Always reply in the same language the user used.",

    // 观察（README 任务）：为验证文档，在 workspace 外做了全局安装
    "- Stay inside the workspace: do not install packages globally, change system settings, or create files outside the workspace unless the task asks for it.",

    // 观察（README 任务）：读取了 .env
    "- Never read or print secret files such as .env. If you need a value from one, ask the user.",

   // 预防（真实项目）：改动由用户用 git diff 审查
   "- Do not run git commands that change history, branches or remotes (commit, push, reset, checkout, rebase, clean). The user reviews your changes with git diff.",

   // 观察：叙述用英文，结论用中文
   "- Always reply in the same language the user used.",

  ].join("\n");
}
````

### `src/trace/trace-collector.ts`

````typescript
import type {
  AssistantMessage,
  Model,
} from "../ai/types.js";

import type {
  ModelCallTrace,
  RunTrace,
  ToolCallTrace,
  TraceEvent,
} from "./types.js";


export type TraceCollector = {
  readonly trace: RunTrace;

  startTurn(
    turnIndex: number,
  ): void;

  endTurn(
    turnIndex: number,
  ): void;

  startModelCall(input: {
    callId: string;
    turnIndex: number;
    model: Model;
    inputMessageCount: number;
  }): void;

  endModelCall(input: {
    callId: string;
    stopReason:
      AssistantMessage["stopReason"];
    errorMessage?: string;
  }): void;

  startToolCall(input: {
    toolCallId: string;
    turnIndex: number;
    toolName: string;
    args: unknown;
  }): void;

  endToolCall(input: {
    toolCallId: string;
    isError: boolean;
    errorMessage?: string;
  }): void;

  finish(
    status:
      | "completed"
      | "error"
      | "aborted",
  ): void;
};


export function createTraceCollector(
  runId: string,
): TraceCollector {
  const startedAt =
    Date.now();


  const trace: RunTrace = {
    runId,

    status:
      "running",

    startedAt,

    modelCalls: [],

    toolCalls: [],

    events: [
      {
        type:
          "run_start",

        timestamp:
          startedAt,
      },
    ],
  };


  function record(
    event: TraceEvent,
  ): void {
    trace.events.push(
      event,
    );
  }


  return {
    trace,


    startTurn(
      turnIndex,
    ) {
      record({
        type:
          "turn_start",

        turnIndex,

        timestamp:
          Date.now(),
      });
    },


    endTurn(
      turnIndex,
    ) {
      record({
        type:
          "turn_end",

        turnIndex,

        timestamp:
          Date.now(),
      });
    },


    startModelCall(input) {
      const startedAt =
        Date.now();


      const modelCall:
        ModelCallTrace = {
        callId:
          input.callId,

        turnIndex:
          input.turnIndex,

        model: {
          id:
            input.model.id,

          provider:
            input.model.provider,
        },

        startedAt,

        inputMessageCount:
          input.inputMessageCount,
      };


      trace.modelCalls.push(
        modelCall,
      );


      record({
        type:
          "model_call_start",

        callId:
          input.callId,

        turnIndex:
          input.turnIndex,

        timestamp:
          startedAt,
      });
    },


    endModelCall(input) {
      const modelCall =
        trace.modelCalls.find(
          (candidate) =>
            candidate.callId
            === input.callId,
        );


      if (!modelCall) {
        throw new Error(
          `Unknown model call: ${input.callId}`,
        );
      }


      const endedAt =
        Date.now();


      modelCall.endedAt =
        endedAt;

      modelCall.stopReason =
        input.stopReason;


      if (
        input.errorMessage
        !== undefined
      ) {
        modelCall.errorMessage =
          input.errorMessage;
      }


      record({
        type:
          "model_call_end",

        callId:
          input.callId,

        turnIndex:
          modelCall.turnIndex,

        stopReason:
          input.stopReason,

        timestamp:
          endedAt,
      });
    },


    startToolCall(input) {
      const startedAt =
        Date.now();


      const toolCall:
        ToolCallTrace = {
        toolCallId:
          input.toolCallId,

        turnIndex:
          input.turnIndex,

        toolName:
          input.toolName,

        args:
          input.args,

        startedAt,
      };


      trace.toolCalls.push(
        toolCall,
      );


      record({
        type:
          "tool_call_start",

        toolCallId:
          input.toolCallId,

        turnIndex:
          input.turnIndex,

        toolName:
          input.toolName,

        args:
          input.args,

        timestamp:
          startedAt,
      });
    },


    endToolCall(input) {
      const toolCall =
        trace.toolCalls.find(
          (candidate) =>
            candidate.toolCallId
            === input.toolCallId,
        );


      if (!toolCall) {
        throw new Error(
          `Unknown tool call: ${input.toolCallId}`,
        );
      }


      const endedAt =
        Date.now();


      toolCall.endedAt =
        endedAt;

      toolCall.isError =
        input.isError;


      if (
        input.errorMessage
        !== undefined
      ) {
        toolCall.errorMessage =
          input.errorMessage;
      }


      record({
        type:
          "tool_call_end",

        toolCallId:
          input.toolCallId,

        turnIndex:
          toolCall.turnIndex,

        toolName:
          toolCall.toolName,

        isError:
          input.isError,

        timestamp:
          endedAt,
      });
    },


    finish(status) {
      /*
       * 避免同一个 Run 被结束两次。
       */
      if (
        trace.status
        !== "running"
      ) {
        return;
      }


      const endedAt =
        Date.now();


      trace.status =
        status;

      trace.endedAt =
        endedAt;


      record({
        type:
          "run_end",

        status,

        timestamp:
          endedAt,
      });
    },
  };
}
````

### `src/trace/trace-extension.ts`

````typescript
import type {
  AgentExtension,
} from "../agent/extension.js";

import type {
  TraceCollector,
} from "./trace-collector.js";


// 把 Extension 生命周期通知转换为 TraceCollector 的记录操作。
export function createTraceExtension(
  trace: TraceCollector,
): AgentExtension {
  return {
    name: "trace",
    hooks: {
    onTurnStart({ turnIndex }) {
      trace.startTurn(turnIndex);
    },

    beforeModelCall(input) {
      trace.startModelCall(input);
    },

    afterModelCall({
      callId,
      message,
    }) {
      trace.endModelCall({
        callId,
        stopReason: message.stopReason,

        ...(message.errorMessage !== undefined
          ? {
              errorMessage: message.errorMessage,
            }
          : {}),
      });
    },

    beforeToolCall({
      turnIndex,
      toolCall,
    }) {
      trace.startToolCall({
        toolCallId: toolCall.id,
        turnIndex,
        toolName: toolCall.name,
        args: toolCall.arguments,
      });
    },

    afterToolCall({
      toolCall,
      isError,
      errorMessage,
    }) {
      trace.endToolCall({
        toolCallId: toolCall.id,
        isError,

        ...(errorMessage !== undefined
          ? { errorMessage }
          : {}),
      });
    },

    onTurnEnd({ turnIndex }) {
      trace.endTurn(turnIndex);
    },

    onRunEnd({ status }) {
      trace.finish(status);
    },
    },
  };
}
````

### `src/trace/types.ts`

````typescript
import type {
  AssistantMessage,
} from "../ai/types.js";


export type TraceRunStatus =
  | "running"
  | "completed"
  | "error"
  | "aborted";


/*
 * 一次模型调用的最终结果。
 *
 * 注意：
 * 这里记录的是“模型调用”，
 * 不是整个 Agent Run。
 */
export type ModelCallTrace = {
  callId: string;

  turnIndex: number;

  model: {
    id: string;
    provider: string;
  };

  startedAt: number;

  endedAt?: number;

  /*
   * 发送给模型多少条消息。
   *
   * 先不保存完整 messages，
   * 避免 Trace 一开始就复制整个 Context。
   */
  inputMessageCount: number;

  stopReason?:
    AssistantMessage["stopReason"];

  errorMessage?: string;
};


/*
 * 一次 ToolCall 的执行记录。
 */
export type ToolCallTrace = {
  toolCallId: string;

  turnIndex: number;

  toolName: string;

  args: unknown;

  startedAt: number;

  endedAt?: number;

  isError?: boolean;

  errorMessage?: string;
};


/*
 * Trace 中真正按时间发生的事件。
 *
 * 第一版只保留：
 * Run / Turn / Model / Tool
 *
 * 不记录 text_delta，
 * 否则一个回答可能产生几百条 TraceEvent。
 */
export type TraceEvent =
  | {
      type: "run_start";

      timestamp: number;
    }

  | {
      type: "turn_start";

      turnIndex: number;

      timestamp: number;
    }

  | {
      type: "model_call_start";

      callId: string;

      turnIndex: number;

      timestamp: number;
    }

  | {
      type: "model_call_end";

      callId: string;

      turnIndex: number;

      stopReason:
        AssistantMessage["stopReason"];

      timestamp: number;
    }

  | {
      type: "tool_call_start";

      toolCallId: string;

      turnIndex: number;

      toolName: string;

      args: unknown;

      timestamp: number;
    }

  | {
      type: "tool_call_end";

      toolCallId: string;

      turnIndex: number;

      toolName: string;

      isError: boolean;

      timestamp: number;
    }

  | {
      type: "turn_end";

      turnIndex: number;

      timestamp: number;
    }

  | {
      type: "run_end";

      status:
        Exclude<
          TraceRunStatus,
          "running"
        >;

      timestamp: number;
    };


// RunTrace
// ├── runId / status / startedAt
// ├── modelCalls
// ├── toolCalls
// └── events
export type RunTrace = {
  runId: string;

  status:
    TraceRunStatus;

  startedAt: number;

  endedAt?: number;

  /*
   * 以后可以直接回答：
   *
   * - 调了几次模型？
   * - 每次为什么结束？
   */
  modelCalls:
    ModelCallTrace[];


  /*
   * 以后可以直接回答：
   *
   * - 调了什么工具？
   * - 参数是什么？
   * - 是否失败？
   */
  toolCalls:
    ToolCallTrace[];


  /*
   * 保留真实发生顺序。
   */
  events:
    TraceEvent[];
};
````

### `src/examples/coding-task.ts`

````typescript
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  dirname,
  join,
} from "node:path";

import {
  Agent,
} from "../agent/agent.js";

import type {
  TextContent,
} from "../ai/types.js";

import {
  createOpenAICompatibleStreamFn,
} from "../ai/providers/openai-compatible.js";

import {
  createBudgetExtension,
} from "../extensions/budget.js";

import {
  createLoggerExtension,
} from "../logging/logger-extension.js";

import {
  createEditFileTool,
} from "../tools/edit-file.js";

import {
  createListDirectoryTool,
} from "../tools/list-directory.js";

import {
  createReadFileTool,
} from "../tools/read-file.js";

import {
  createRunCommandTool,
} from "../tools/run-command.js";

import {
  createSearchTextTool,
} from "../tools/search-text.js";

import {
  createWriteFileTool,
} from "../tools/write-file.js";

import {
  createCodingSystemPrompt,
} from "../prompts/coding-system-prompt.js";


function requiredEnv(
  name: string,
): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}


const apiKey = requiredEnv("AGENT_API_KEY");
const baseUrl = requiredEnv("AGENT_BASE_URL");
const modelId = requiredEnv("AGENT_MODEL");


/*
 * 仍然是临时 sandbox：
 * run_command 能执行任意命令，先不让它碰真实项目。
 */
// tmpdir()：取得系统临时目录。你在 Windows 上可能得到 C:\Users\Jmiao\AppData\Local\Temp
const workspaceRoot = await mkdtemp(
  join(tmpdir(), "agent-coding-"),
);


try {
  const testSource = [
    'import assert from "node:assert/strict";',
    'import { test } from "node:test";',
    'import { average, clamp } from "../src/stats.js";',
    "",
    'test("average of several numbers", () => {',
    "  assert.equal(average([2, 4, 6]), 4);",
    "});",
    "",
    'test("average of empty list is 0", () => {',
    "  assert.equal(average([]), 0);",
    "});",
    "",
    'test("clamp keeps value in range", () => {',
    "  assert.equal(clamp(15, 0, 10), 10);",
    "  assert.equal(clamp(-5, 0, 10), 0);",
    "  assert.equal(clamp(5, 0, 10), 5);",
    "});",
    "",
  ].join("\n");

  const files: Record<string, string> = {
    "package.json": `${JSON.stringify(
      {
        name: "stats-demo",
        version: "1.0.0",
        type: "module",
        scripts: {
          test: "node --test",
        },
      },
      null,
      2,
    )}\n`,

    "README.md": [
      "# stats-demo",
      "",
      "Run the tests with `npm test`.",
      "",
    ].join("\n"),

    // bug：循环从 i = 1 开始，漏掉了第一个元素
    "src/stats.js": [
      "export function average(numbers) {",
      "  if (numbers.length === 0) {",
      "    return 0;",
      "  }",
      "",
      "  let sum = 0;",
      "",
      "  for (let i = 1; i < numbers.length; i++) {",
      "    sum += numbers[i];",
      "  }",
      "",
      "  return sum / numbers.length;",
      "}",
      "",
      "export function clamp(value, min, max) {",
      "  return Math.min(Math.max(value, min), max);",
      "}",
      "",
    ].join("\n"),

    "test/stats.test.js": testSource,
  };

  for (const [path, content] of Object.entries(files)) {
    const absolutePath =
      join(workspaceRoot, ...path.split("/"));

    await mkdir(dirname(absolutePath), {
      recursive: true,
    });

    await writeFile(absolutePath, content, "utf8");
  }


  const runCommandTool =
    createRunCommandTool(workspaceRoot);

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
        runCommandTool,
      ],
    },

    loopConfig: {
      convertToLlm(messages) {
        return [...messages];
      },

      extensions: [
        // 闭环任务步数更多，放宽一些，但仍然有上限
        createBudgetExtension({
          maxModelCalls: 15,
          maxToolCalls: 20,
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

  agent.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      executedTools.push(event.toolName);
    }

    // 打印模型实际看到的命令输出
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

  await agent.prompt(
    [
      "这个项目的测试没有通过。",
      "请运行测试，找出失败原因并修复源码，直到全部测试通过。",
      "不要修改测试文件。",
    ].join("\n"),
  );


  console.log("\n执行过的工具：", executedTools);
  console.log("模型调用次数：", modelCallCount);

  // 1. 测试文件必须一字未动：不能靠改测试让测试通过
  const testAfter = await readFile(
    join(workspaceRoot, "test", "stats.test.js"),
    "utf8",
  );

  if (testAfter !== testSource) {
    throw new Error("Model modified the test file.");
  }

  // 2. 不信模型说的"已通过"，Harness 自己再跑一次
  const verification = await runCommandTool.execute(
    "harness-verify",
    {
      command: "node --test",
    },
  );

  console.log(
    `\n===== harness verification =====\n${verification.content[0]?.text ?? ""}`,
  );

  if (verification.details.exitCode !== 0) {
    throw new Error(
      "Tests still fail after the agent finished.",
    );
  }

  // 3. 修复后有没有重新验证
  const runCount = executedTools.filter(
    (name) => name === "run_command",
  ).length;

  if (runCount < 2) {
    console.warn(
      `注意：模型只运行了 ${runCount} 次命令，修复后没有重新验证。`,
    );
  }

  console.log("\nCODING-4 RUN_COMMAND REAL RUN PASS");
} finally {
  await rm(workspaceRoot, {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
}
````

### `src/examples/file-tool-loop.ts`

````typescript
import {
  mkdir,
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
  Agent,
} from "../agent/agent.js";

import {
  createOpenAICompatibleStreamFn,
} from "../ai/providers/openai-compatible.js";

import {
  createListDirectoryTool,
} from "../tools/list-directory.js";

import {
  createReadFileTool,
} from "../tools/read-file.js";
import type {TextContent} from "../ai/types.js";

import {
  createTraceExtension,
} from "../trace/trace-extension.js";

import {
  createLoggerExtension,
} from "../logging/logger-extension.js";

import {
  createTraceCollector,
} from "../trace/trace-collector.js";

import {
  createBudgetExtension,
} from "../extensions/budget.js";

function requiredEnv(
  name: string,
): string {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}


const apiKey =
  requiredEnv("AGENT_API_KEY");

const baseUrl =
  requiredEnv("AGENT_BASE_URL");

const modelId =
  requiredEnv("AGENT_MODEL");


/*
 * 创建一个安全、隔离的临时 workspace。
 *
 * 模型只能看到这里，
 * 不会接触真实项目的 .env。
 */
const workspaceRoot =
  await mkdtemp(
    join(
      tmpdir(),
      "agent-file-tools-",
    ),
  );


try {
  /*
   * 构造一个模型事先不知道内容的小项目。
   */
  await mkdir(
    join(
      workspaceRoot,
      "src",
    ),
  );


  await writeFile(
    join(
      workspaceRoot,
      "package.json",
    ),

    JSON.stringify(
      {
        name:
          "agent-file-tools-demo",

        version:
          "1.0.0",
      },
      null,
      2,
    ),

    "utf8",
  );


  await writeFile(
    join(
      workspaceRoot,
      "src",
      "runtime-settings.ts",
    ),

    `
export const runtimeMode =
  "safe-local";

export const maxWorkers =
  4;
`.trim(),

    "utf8",
  );


  await writeFile(
    join(
      workspaceRoot,
      "README.md",
    ),

    `
# Demo Project

Inspect the project files to answer questions.
`.trim(),

    "utf8",
  );


  const listDirectoryTool =
    createListDirectoryTool(
      workspaceRoot,
    );


  const readFileTool =
    createReadFileTool(
      workspaceRoot,
    );


  // createOpenAICompatibleStreamFn 是一个“创建模型连接函数”的函数。
  const streamFn =
    createOpenAICompatibleStreamFn({
      apiKey,
      baseUrl,
    });

  const trace =
  createTraceCollector("file-tool-run-1");

  const traceExtension =
  createTraceExtension(trace);

  const loggerExtension =
  createLoggerExtension();

  const budget =
  createBudgetExtension({
    maxModelCalls: 10,
    maxToolCalls: 10,
  });


  const agent =
    new Agent({
      initialState: {
        model: {
          id:
            modelId,

          provider:
            "openai-compatible",

          name:
            modelId,

          contextWindow:
            128_000,

          maxTokens:
            4096,
        },

        tools: [
          listDirectoryTool,
          readFileTool,
        ],
      },


      loopConfig: {
        convertToLlm(messages) {
          return [
            ...messages,
          ];
        },
        extensions: [
          budget,
          traceExtension,
          loggerExtension,
        ],
      },


      streamFn,
    });


  const executedTools:
    string[] = [];


  agent.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      executedTools.push(event.toolName);
    }

    if (
      event.type === "message_end"
      && event.message.role === "assistant"
    ) {
      console.log(
        "\n[assistant]",
        event.message.content,
      );
    }
  });


  console.log(
    "开始真实文件工具 Agent...",
  );

  console.log(
    "workspace:",
    workspaceRoot,
  );


  await agent.prompt(
    [
      "请检查当前 workspace，回答两个问题：",
      "1. 这个项目的名称是什么？",
      "2. runtime mode 是什么？",
      "",
      "不要猜测。",
      "必须先使用 list_directory 查看目录结构，",
      "再使用 read_file 阅读必要文件，",
      "根据工具得到的真实内容回答。",
    ].join("\n"),
  );

  console.log("\nTrace summary:", {
  status: trace.trace.status,
  modelCalls: trace.trace.modelCalls.length,
  toolCalls: trace.trace.toolCalls.length,
  });

  console.dir(trace.trace.toolCalls, {
    depth: null,
  });


  console.log(
    "\n执行过的工具：",
    executedTools,
  );

  console.log(
    "Budget:",
    budget.getState(),
  );


  /*
   * 最低验收：
   * 两类真实文件工具都必须实际执行。
   */
  if (
    !executedTools.includes(
      "list_directory",
    )
  ) {
    throw new Error(
      "Model never used list_directory.",
    );
  }


  if (
    !executedTools.includes(
      "read_file",
    )
  ) {
    throw new Error(
      "Model never used read_file.",
    );
  }


  const finalMessage =
    [...agent.state.messages]
      .reverse()
      .find(
        (message) =>
          message.role
          === "assistant",
      );


  if (
    !finalMessage
    || finalMessage.role
      !== "assistant"
  ) {
    throw new Error(
      "Missing final assistant message.",
    );
  }


  const finalText =
    finalMessage.content
    .filter(
      (item): item is TextContent =>
        item.type === "text",
    )
      .map(
        (item) =>
          item.text,
      )
      .join("\n");


  /*
   * 最终回答还必须真的引用文件里的事实。
   */
  if (
    !finalText.includes(
      "agent-file-tools-demo",
    )
  ) {
    throw new Error(
      "Final answer missed project name.",
    );
  }


  if (
    !finalText.includes(
      "safe-local",
    )
  ) {
    throw new Error(
      "Final answer missed runtime mode.",
    );
  }


  console.log(
    "\nM05.4c REAL FILE TOOL LOOP PASS",
  );
}
finally {
  await rm(
    workspaceRoot,
    {
      recursive: true,
      force: true,
    },
  );
}
````

### `src/examples/non-streaming.ts`

````typescript
import type {
  Context,
  Model,
} from "../ai/types.js";

import {
  requestChatCompletionOnce,
} from "../ai/providers/openai-compatible.js";


/**
 * 读取必须存在的环境变量。
 *
 * 如果没有配置，就立即明确报错，
 * 而不是让 undefined 一路传到 Provider。
 */
function requiredEnv(
  name: string,
): string {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}


/*
 * 从 .env 读取真实 Provider 配置。
 */
const apiKey =
  requiredEnv("AGENT_API_KEY");

const baseUrl =
  requiredEnv("AGENT_BASE_URL");

const modelId =
  requiredEnv("AGENT_MODEL");


/**
 * Model 是我们 Agent Core 内部的统一模型描述。
 *
 * 这次真正请求中，
 * requestChatCompletionOnce() 实际主要使用 model.id。
 *
 * contextWindow / maxTokens 当前还没有发送给 API，
 * 后续完善模型注册表时再校准真实规格。
 */
const model: Model = {
  id: modelId,

  provider:
    "openai-compatible",

  name: modelId,

  contextWindow: 1,
  maxTokens: 1,
};


/**
 * 构造最小对话上下文。
 */
const context: Context = {
  messages: [
    {
      role: "user",

      content:
        "只回复一句：真实模型连接成功。",

      timestamp:
        Date.now(),
    },
  ],
};


console.log(
  "正在请求真实模型...",
);


/**
 * 真正进入：
 *
 * Message
 *   ↓
 * toOpenAIMessage()
 *   ↓
 * fetch()
 *   ↓
 * Provider API
 *   ↓
 * JSON Response
 */
const answer =
  await requestChatCompletionOnce(
    {
      apiKey,
      baseUrl,
    },

    model,
    context,
  );


console.log(
  "模型返回：",
  answer,
);
````

### `src/examples/streaming.ts`

````typescript
import type {
  Context,
  Model,
} from "../ai/types.js";

import {
  createOpenAICompatibleStreamFn,
} from "../ai/providers/openai-compatible.js";


/**
 * 读取必须存在的环境变量。
 */
function requiredEnv(
  name: string,
): string {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}


const apiKey =
  requiredEnv("AGENT_API_KEY");

const baseUrl =
  requiredEnv("AGENT_BASE_URL");

const modelId =
  requiredEnv("AGENT_MODEL");


/**
 * 当前真实模型描述。
 *
 * contextWindow / maxTokens
 * 暂时不是本次验证重点。
 */
const model: Model = {
  id: modelId,
  provider: "openai-compatible",
  name: modelId,

  contextWindow: 1,
  maxTokens: 1,
};


/**
 * 给模型的一轮最小上下文。
 */
const context: Context = {
  messages: [
    {
      role: "user",

      content:
        "只回复一句：流式模型连接成功。",

      timestamp:
        Date.now(),
    },
  ],
};


/**
 * 创建真正的 StreamFn。
 */
const streamFn =
  createOpenAICompatibleStreamFn({
    apiKey,
    baseUrl,
  });


console.log(
  "开始真实 Streaming：",
);


/**
 * 调用方式已经和 AgentLoop
 * 调用 StreamFn 基本一致。
 */
const controller =
  new AbortController();

const stream =
  await streamFn(
    model,
    context,
    {
      signal: controller.signal,
    },
  );


/**
 * 一边收到事件，
 * 一边观察 Streaming 行为。
 */
for await (const event of stream) {
  switch (event.type) {
    case "start": {
      console.log(
        "\n[start]",
      );

      break;
    }


    case "text_delta": {
      /**
       * 不换行，
       * 直接把 delta 连续打印出来。
       */
      process.stdout.write(
        event.delta,
      );

      break;
    }


    case "done": {
      console.log(
        "\n[done]",
      );

      break;
    }


    case "error": {
      console.error(
        "\n[error]",
        event.error.errorMessage,
      );

      break;
    }
  }
}
````

### `src/examples/tool-calling.ts`

````typescript
import Type from "typebox";

import {
  Agent,
} from "../agent/agent.js";

import type {
  AgentTool,
} from "../agent/types.js";

import {
  createOpenAICompatibleStreamFn,
} from "../ai/providers/openai-compatible.js";


function requiredEnv(
  name: string,
): string {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}


const apiKey =
  requiredEnv("AGENT_API_KEY");

const baseUrl =
  requiredEnv("AGENT_BASE_URL");

const modelId =
  requiredEnv("AGENT_MODEL");


const addParameters =
  Type.Object(
    {
      a: Type.Number(),
      b: Type.Number(),
    },
    {
      additionalProperties: false,
    },
  );


const addTool:
  AgentTool<
    typeof addParameters,
    { result: number }
  > = {
  name: "add_numbers",

  label: "Add Numbers",

  description:
    "Add two numbers together.",

  parameters:
    addParameters,


  async execute(
    _toolCallId,
    parameters,
  ) {
    const result =
      parameters.a
      + parameters.b;

    console.log(
      `[tool] ${parameters.a} + ${parameters.b} = ${result}`,
    );

    return {
      content: [
        {
          type: "text",
          text: String(result),
        },
      ],

      details: {
        result,
      },
    };
  },
};


const streamFn =
  createOpenAICompatibleStreamFn({
    apiKey,
    baseUrl,
  });


const agent =
  new Agent({
    initialState: {
      model: {
        id: modelId,
        provider:
          "openai-compatible",
        name: modelId,

        // 当前示例暂时沿用占位规格。
        contextWindow: 128_000,
        maxTokens: 4096,
      },

      tools: [
        addTool,
      ],
    },


    loopConfig: {
      convertToLlm(messages) {
        return [
          ...messages,
        ];
      },
    },


    streamFn,
  });


agent.subscribe((event) => {
  switch (event.type) {
    case "tool_execution_start":
      console.log(
        `[tool start] ${event.toolName}`,
        event.args,
      );

      break;


    case "tool_execution_end":
      console.log(
        `[tool end] ${event.toolName}`,
        event.result,
      );

      break;


    case "message_end": {
      if (
        event.message.role
        === "assistant"
      ) {
        console.log(
          "[assistant]",
          event.message.content,
        );
      }

      break;
    }
  }
});


console.log(
  "开始真实 Tool Calling...",
);


await agent.prompt(
  "请使用 add_numbers 工具计算 17 + 25。必须调用工具，不要自己心算。",
);


console.log(
  "\n最终 transcript：",
);


for (
  const message of
    agent.state.messages
) {
  console.dir(
    message,
    {
      depth: null,
    },
  );
}
````

### `src/core/action-result.ts`

````typescript
export type ExecutionStatus =
  | "COMPLETED"
  | "EXECUTION_ERROR"
  | "CANCELLED"
  | "INCONCLUSIVE";


type ActionResultBase = {
  logicalActionId: string;
  invocationId: string;
  actionType: string;

  classificationVersion: number;
  supersedes?: number;

  reasonCode: string;
};
// logicalActionId
// → 这是哪个逻辑动作
//
// invocationId
// → 这是该动作的哪一次具体执行
//
// actionType
// → 执行的是什么动作
//
// reasonCode
// → 为什么得到当前结果


export type CompletedResult<TOutcome> = ActionResultBase & {
  status: "COMPLETED";

  outcome: TOutcome;
};


export type ExecutionErrorResult = ActionResultBase & {
  status: "EXECUTION_ERROR";

  executionError: {
    code: string;
    phase: string;
  };
};


export type CancelledResult = ActionResultBase & {
  status: "CANCELLED";

  cancellation: {
    requestId: string;
    caller: string;
  };
};

// Runtime 没有足够证据可靠地判断结果
// {
//   logicalActionId: "run-tests-1",
//   invocationId: "invoke-1",
//   actionType: "RUN_TESTS",
//   reasonCode: "MISSING_JUNIT_REPORT",
//
//   status: "INCONCLUSIVE",
//
//   missingEvidence: [
//     "JUnit report"
//   ]
// }
export type InconclusiveResult = ActionResultBase & {
  status: "INCONCLUSIVE";

  missingEvidence: [string, ...string[]];
};
// [string, ...string[]]至少必须有一个字符串


export type ActionResult<TOutcome> =
  | CompletedResult<TOutcome>
  | ExecutionErrorResult
  | CancelledResult
  | InconclusiveResult;
````

### `src/core/run-status.ts`

````typescript
export type RunStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "NEEDS_HUMAN"
  | "CANCELLED";


export type RunResult = {
  runId: string;
  status: RunStatus;
};
````

### `tests/action-result.type-test.ts`

````typescript
import type { ActionResult } from "../src/core/action-result.js";


// 测试用 outcome
type ExampleOutcome = {
  verdict: "PASS" | "FAIL";
};

// ====================
// 合法状态
// ====================

const completed: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-001",
  invocationId: "invocation-001",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "PROCESS_COMPLETED",

  status: "COMPLETED",

  outcome: {
    verdict: "FAIL",
  },
};


const executionError: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-002",
  invocationId: "invocation-002",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "SPAWN_FAILED",

  status: "EXECUTION_ERROR",

  executionError: {
    code: "ENOENT",
    phase: "spawn",
  },
};


const cancelled: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-003",
  invocationId: "invocation-003",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "USER_CANCELLED",

  status: "CANCELLED",

  cancellation: {
    requestId: "request-001",
    caller: "user",
  },
};


const inconclusive: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-004",
  invocationId: "invocation-004",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "MISSING_EVIDENCE",

  status: "INCONCLUSIVE",

  missingEvidence: [
    "JUnit report missing",
  ],
};


// ====================
// 非法状态
// ====================

const invalidCompleted: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-005",
  invocationId: "invocation-005",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "INVALID",

  status: "COMPLETED",
  outcome: { verdict: "PASS" },

  // @ts-expect-error COMPLETED 不能携带 executionError
  executionError: {
    code: "ENOENT",
    phase: "spawn",
  },
};


const invalidExecutionError: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-006",
  invocationId: "invocation-006",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "INVALID",

  status: "EXECUTION_ERROR",

  executionError: {
    code: "TIMEOUT",
    phase: "execution",
  },

  // @ts-expect-error EXECUTION_ERROR 不能携带 outcome
  outcome: "PASS",
};


const invalidInconclusive: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-007",
  invocationId: "invocation-007",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "INVALID",

  status: "INCONCLUSIVE",

  // @ts-expect-error INCONCLUSIVE 至少需要一条 missing evidence
  // 我要求下一行必须产生 TypeScript 错误。
  missingEvidence: [],
};


// @ts-expect-error CANCELLED 必须携带 cancellation provenance
const invalidCancelled: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-008",
  invocationId: "invocation-008",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "INVALID",

  status: "CANCELLED",
};


const reclassified: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-001",
  invocationId: "invocation-001",
  actionType: "run_tests",

  classificationVersion: 2,
  supersedes: 1,

  reasonCode: "EVIDENCE_RESOLVED",

  status: "COMPLETED",

  outcome: {
    verdict: "FAIL",
  },
};


// 防止 isolatedModules 下文件没有实际使用
void [
  completed,
  executionError,
  cancelled,
  inconclusive,
  invalidCompleted,
  invalidExecutionError,
  invalidInconclusive,
  invalidCancelled,
];


function describeResult<TOutcome>(
  result: ActionResult<TOutcome>,
): string {
  switch (result.status) {
    case "COMPLETED":
      return `completed: ${result.outcome}`;

    case "EXECUTION_ERROR":
      return `execution error: ${result.executionError.code}`;

    case "CANCELLED":
      return `cancelled by: ${result.cancellation.caller}`;

    case "INCONCLUSIVE":
      return `missing: ${result.missingEvidence.join(", ")}`;
  }
}
````

### `tests/agent-loop.test.ts`

````typescript
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import Type from "typebox";

import type {
  AssistantMessage,
  Message,
  UserMessage,
} from "../src/ai/types.js";

import {
  createAssistantMessageEventStream,
} from "../src/ai/event-stream.js";

import {
  runAgentLoop,
} from "../src/agent/agent-loop.js";

import {
  createOpenAICompatibleStreamFn,
} from "../src/ai/providers/openai-compatible.js";

import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentTool,
  StreamFn,
} from "../src/agent/types.js";

import {
  BudgetExceededError,
  createBudgetExtension,
} from "../src/extensions/budget.js";

import {
  createLoggerExtension,
} from "../src/logging/logger-extension.js";

import {
  createTraceCollector,
} from "../src/trace/trace-collector.js";

import {
  createTraceExtension,
} from "../src/trace/trace-extension.js";


describe("runAgentLoop", () => {
  it("runs one streamed model turn and emits lifecycle events in order", async () => {
    const prompt: UserMessage = {
      role: "user",
      content: "hello",
      timestamp: 1,
    };


    const assistantMessage: AssistantMessage = {
      role: "assistant",

      content: [
        {
          type: "text",
          text: "hi",
        },
      ],

      provider: "fakes",
      model: "fakes-model",

      stopReason: "stop",

      timestamp: 2,
    };


    const modelCalls: Message[][] = [];

    const trace =
      createTraceCollector("hook-test");

    const logs: string[] = [];


    const config: AgentLoopConfig = {
      model: {
        id: "fakes-model",
        provider: "fakes",
        name: "Fake Model",
        contextWindow: 1000,
        maxTokens: 100,
      },

      convertToLlm(messages) {
        return [...messages];
      },

      extensions: [
        createTraceExtension(trace),
        createLoggerExtension((message) => {
          logs.push(message);
        }),
      ],
    };



    const streamFn: StreamFn = async (
      _model,
      context,
    ) => {
      modelCalls.push([
        ...context.messages,
      ]);

      const stream =
        createAssistantMessageEventStream();


      stream.push({
        type: "start",
        partial: assistantMessage,
      });


      stream.push({
        type: "text_delta",
        contentIndex: 0,
        delta: "hi",
        partial: assistantMessage,
      });


      stream.push({
        type: "done",
        reason: "stop",
        message: assistantMessage,
      });


      stream.end();

      return stream;
    };


    const context: AgentContext = {
      messages: [],
      tools: [],
    };


    const events: AgentEvent[] = [];


    const newMessages = await runAgentLoop(
      [prompt],
      context,
      config,
      undefined,
      streamFn,
      (event) => {
        events.push(event);
      },
    );


    expect(modelCalls).toHaveLength(1);

    expect(modelCalls[0]).toEqual([
      prompt,
    ]);


    expect(newMessages).toEqual([
      prompt,
      assistantMessage,
    ]);


    expect(
      events.map((event) => event.type),
    ).toEqual([
      "agent_start",
      "turn_start",

      "message_start",
      "message_end",

      "message_start",
      "message_update",
      "message_end",

      "turn_end",
      "agent_end",
    ]);

    expect(trace.trace.status).toBe("completed");
    expect(trace.trace.modelCalls).toHaveLength(1);

    expect(
      trace.trace.events.map((event) => event.type),
    ).toEqual([
      "run_start",
      "turn_start",
      "model_call_start",
      "model_call_end",
      "turn_end",
      "run_end",
    ]);

    expect(logs).toEqual([
      "[turn 0] start",
      "[model start] call=model-0 turn=0 model=fakes-model messages=1",
      "[model end] call=model-0 turn=0 stopReason=stop",
      "[turn 0] end",
      "[run end] status=completed",
    ]);
  });

  it("runs a minimal Model -> Tool -> Model vertical slice", async () => {
  const prompt: UserMessage = {
    role: "user",
    content: "现在几点？",
    timestamp: 1,
  };

  const toolCallMessage: AssistantMessage = {
    role: "assistant",

    content: [
      {
        type: "toolCall",
        id: "call-1",
        name: "get_time",
        arguments: {},
      },
    ],

    provider: "fakes",
    model: "fakes-model",
    stopReason: "toolUse",
    timestamp: 2,
  };

  const finalMessage: AssistantMessage = {
    role: "assistant",

    content: [
      {
        type: "text",
        text: "现在是 10:30。",
      },
    ],

    provider: "fakes",
    model: "fakes-model",
    stopReason: "stop",
    timestamp: 4,
  };

  const modelCalls: Message[][] = [];

  let callCount = 0;

  const streamFn: StreamFn = async (
    _model,
    context,
  ) => {
    modelCalls.push([
      ...context.messages,
    ]);

    callCount += 1;

    const stream =
      createAssistantMessageEventStream();

    const message =
      callCount === 1
        ? toolCallMessage
        : finalMessage;

    stream.push({
      type: "start",
      partial: message,
    });

    stream.push({
      type: "done",
      reason: message.stopReason === "toolUse"
        ? "toolUse"
        : "stop",
      message,
    });

    stream.end();

    return stream;
  };

  const getTimeParameters =
  Type.Object(
    {},
    {
      additionalProperties: false,
    },
  );
  // 不允许出现 Schema 中未声明的额外字段 ，在“获取当前时间”工具中，它表示模型只需要调用工具，不需要提供参数：

  const getTimeTool = {
  name: "get_time",

  label: "Get Time",

  description:
    "Get the current time",

  parameters:
    getTimeParameters,

  async execute() {
    return {
      content: [
        {
          type: "text" as const,
          text: "10:30",
        },
      ],

      details: {},
    };
  },
};

  const config: AgentLoopConfig = {
    model: {
      id: "fakes-model",
      provider: "fakes",
      name: "Fake Model",
      contextWindow: 1000,
      maxTokens: 100,
    },

    convertToLlm(messages) {
      return [...messages];
    },
  };

  const context: AgentContext = {
    messages: [],
    tools: [
      getTimeTool,
    ],
  };

  const events: AgentEvent[] = [];

  const newMessages =
    await runAgentLoop(
      [prompt],
      context,
      config,
      undefined,
      streamFn,
      (event) => {
        events.push(event);
      },
    );

  expect(modelCalls).toHaveLength(2);

  expect(modelCalls[0]).toEqual([
    prompt,
  ]);

  expect(modelCalls[1]?.map(
    (message) => message.role,
  )).toEqual([
    "user",
    "assistant",
    "toolResult",
  ]);

  expect(newMessages.map(
    (message) => message.role,
  )).toEqual([
    "user",
    "assistant",
    "toolResult",
    "assistant",
  ]);

  expect(newMessages.at(-1))
    .toEqual(finalMessage);
});

  it("turns invalid tool arguments into an error result and continues the loop", async () => {
  const prompt: UserMessage = {
    role: "user",
    content: "南京天气怎么样？",
    timestamp: 1,
  };


  /*
   * 工具要求：
   *
   * city 必须是 string。
   */
  const weatherParameters =
    Type.Object(
      {
        city: Type.String(),
      },
      {
        additionalProperties: false,
      },
    );


  let executeCount = 0;


  const weatherTool = {
    name: "get_weather",

    label: "Get Weather",

    description:
      "Get weather for a city",

    parameters:
      weatherParameters,

    async execute(
      _toolCallId: string,
      _parameters: {
        city: string;
      },
    ) {
      executeCount += 1;

      return {
        content: [
          {
            type: "text" as const,
            text: "sunny",
          },
        ],

        details: {},
      };
    },
  };


  /*
   * 故意模拟模型生成错误参数：
   *
   * city 应该是 string，
   * 这里却给 number。
   */
  const invalidToolCallMessage: AssistantMessage = {
    role: "assistant",

    content: [
      {
        type: "toolCall",
        id: "call-invalid",
        name: "get_weather",

        arguments: {
          city: 123,
        },
      },
    ],

    provider: "fakes",
    model: "fakes-model",

    stopReason: "toolUse",

    timestamp: 2,
  };


  let modelCallCount = 0;

const modelCalls: Message[][] = [];

const finalMessage: AssistantMessage = {
  role: "assistant",

  content: [
    {
      type: "text",
      text: "工具参数有误，无法查询天气。",
    },
  ],

  provider: "fakes",
  model: "fakes-model",

  stopReason: "stop",

  timestamp: 3,
};


const streamFn: StreamFn = async (
  _model,
  context,
) => {
  modelCallCount += 1;

  modelCalls.push([
    ...context.messages,
  ]);


  const stream =
    createAssistantMessageEventStream();


  const message =
    modelCallCount === 1
      ? invalidToolCallMessage
      : finalMessage;


  stream.push({
    type: "start",
    partial: message,
  });


  stream.push({
    type: "done",

    reason:
      message.stopReason === "toolUse"
        ? "toolUse"
        : "stop",

    message,
  });


  stream.end();

  return stream;
};


  const config: AgentLoopConfig = {
    model: {
      id: "fakes-model",
      provider: "fakes",
      name: "Fake Model",

      contextWindow: 1000,
      maxTokens: 100,
    },

    convertToLlm(messages) {
      return [...messages];
    },
  };


const context: AgentContext = {
  messages: [],

  tools: [
    weatherTool,
  ],
};


const newMessages =
  await runAgentLoop(
    [prompt],
    context,
    config,
    undefined,
    streamFn,
    () => {},
  );


/*
 * 1. 参数非法，所以 execute() 绝对不能运行。
 */
expect(executeCount).toBe(0);


/*
 * 2. Agent 不能因为 Tool 参数错误直接死亡。
 *
 * 第一次：
 * Model → invalid ToolCall
 *
 * 第二次：
 * Tool error → Model
 */
expect(modelCalls).toHaveLength(2);


/*
 * 第二次模型调用应该看到：
 *
 * User
 * ↓
 * Assistant ToolCall
 * ↓
 * ToolResult(error)
 */
expect(
  modelCalls[1]?.map(
    (message) => message.role,
  ),
).toEqual([
  "user",
  "assistant",
  "toolResult",
]);


/*
 * 从 Runtime 新产生的消息里找到错误 ToolResult。
 */
const toolResult =
  newMessages.find(
    (message) =>
      message.role === "toolResult",
  );


expect(toolResult).toMatchObject({
  role: "toolResult",

  toolCallId:
    "call-invalid",

  toolName:
    "get_weather",

  isError: true,
});


/*
 * Agent 最后仍然拿到了模型的最终回答。
 */
expect(
  newMessages.at(-1),
).toEqual(
  finalMessage,
);

});


it(
  "runs a complete Provider -> Tool -> Provider loop",
  async () => {
    const encoder = new TextEncoder();

    function createSseResponse(data: string[]): Response {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const item of data) {
            controller.enqueue(
              encoder.encode(`data: ${item}\n\n`),
            );
          }

          controller.close();
        },
      });

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
        },
      });
    }

    const firstResponse = createSseResponse([
      JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "call-1",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":',
              },
            }],
          },
          finish_reason: null,
        }],
      }),
      JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: {
                arguments: '"Nanjing"}',
              },
            }],
          },
          finish_reason: "tool_calls",
        }],
      }),
      "[DONE]",
    ]);

    const secondResponse = createSseResponse([
      JSON.stringify({
        choices: [{
          delta: {
            content: "南京天气晴朗。",
          },
          finish_reason: null,
        }],
      }),
      "[DONE]",
    ]);

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);

    const weatherParameters = Type.Object({
      city: Type.String(),
    });

    let executeCount = 0;

    const weatherTool: AgentTool<
      typeof weatherParameters,
      Record<string, never>
    > = {
      name: "get_weather",
      label: "Get Weather",
      description: "Get weather for a city",
      parameters: weatherParameters,
      async execute(_toolCallId, parameters) {
        executeCount += 1;
        expect(parameters.city).toBe("Nanjing");

        return {
          content: [{
            type: "text",
            text: "sunny, 25°C",
          }],
          details: {},
        };
      },
    };

    const streamFn = createOpenAICompatibleStreamFn({
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
    });

    const prompt: UserMessage = {
      role: "user",
      content: "南京天气怎么样？",
      timestamp: 1,
    };

    const context: AgentContext = {
      messages: [],
      tools: [weatherTool],
    };

    const config: AgentLoopConfig = {
      model: {
        id: "fake-model",
        provider: "openai-compatible",
        name: "Fake Model",
        contextWindow: 1000,
        maxTokens: 100,
      },
      convertToLlm(messages) {
        return [...messages];
      },
    };

    const newMessages = await runAgentLoop(
      [prompt],
      context,
      config,
      undefined,
      streamFn,
      () => {},
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(executeCount).toBe(1);
    expect(newMessages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "assistant",
    ]);

    const secondRequest = fetchMock.mock.calls[1]?.[1];
    const secondBody = JSON.parse(String(secondRequest?.body)) as {
      messages: Array<{
        role: string;
        content: string | null;
        tool_calls?: unknown[];
        tool_call_id?: string;
      }>;
    };

    expect(secondBody.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(secondBody.messages[1]?.tool_calls).toHaveLength(1);
    expect(secondBody.messages[2]?.tool_call_id).toBe("call-1");

    const finalMessage = newMessages.at(-1);
    expect(finalMessage?.role).toBe("assistant");

    if (finalMessage?.role !== "assistant") {
      throw new Error("Expected final assistant message.");
    }

    expect(finalMessage.content[0]).toEqual({
      type: "text",
      text: "南京天气晴朗。",
    });
  },
);

  it("stops before a second model call when budget is exhausted", async () => {
    const prompt: UserMessage = {
      role: "user",
      content: "Use the echo tool.",
      timestamp: 1,
    };

    const toolCallMessage: AssistantMessage = {
      role: "assistant",
      content: [{
        type: "toolCall",
        id: "call-1",
        name: "echo",
        arguments: { text: "hello" },
      }],
      provider: "fake",
      model: "fake-model",
      stopReason: "toolUse",
      timestamp: 2,
    };

    let modelCalls = 0;
    let toolCalls = 0;

    const streamFn: StreamFn = () => {
      modelCalls += 1;

      if (modelCalls > 1) {
        throw new Error("Provider was called after the model budget was exhausted.");
      }

      const stream = createAssistantMessageEventStream();
      stream.push({ type: "start", partial: toolCallMessage });
      stream.push({
        type: "done",
        reason: "toolUse",
        message: toolCallMessage,
      });
      stream.end();
      return stream;
    };

    const echoParameters = Type.Object({ text: Type.String() });
    const echoTool: AgentTool<
      typeof echoParameters,
      Record<string, never>
    > = {
      name: "echo",
      label: "Echo",
      description: "Echo text.",
      parameters: echoParameters,
      async execute(_toolCallId, parameters) {
        toolCalls += 1;
        return {
          content: [{ type: "text", text: parameters.text }],
          details: {},
        };
      },
    };

    const budget = createBudgetExtension({
      maxModelCalls: 1,
      maxToolCalls: 10,
    });
    const trace = createTraceCollector("budget-test-run");
    const logs: string[] = [];

    const config: AgentLoopConfig = {
      model: {
        id: "fake-model",
        provider: "fake",
        name: "Fake Model",
        contextWindow: 1000,
        maxTokens: 100,
      },
      convertToLlm(messages) {
        return [...messages];
      },
      extensions: [
        budget,
        createTraceExtension(trace),
        createLoggerExtension((message) => {
          logs.push(message);
        }),
      ],
    };

    const context: AgentContext = {
      messages: [],
      tools: [echoTool],
    };

    await expect(
      runAgentLoop(
        [prompt],
        context,
        config,
        undefined,
        streamFn,
        () => {},
      ),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    expect(modelCalls).toBe(1);
    expect(toolCalls).toBe(1);
    expect(budget.getState()).toEqual({
      modelCalls: 1,
      toolCalls: 1,
    });
    expect(trace.trace.status).toBe("error");
    expect(trace.trace.endedAt).toBeDefined();
    expect(trace.trace.modelCalls).toHaveLength(1);
    expect(trace.trace.toolCalls).toHaveLength(1);
    expect(logs).toContain("[run end] status=error");
  });

  it("returns an error ToolResult when tool budget is exceeded and continues", async () => {
    const prompt: UserMessage = {
      role: "user",
      content: "Echo twice.",
      timestamp: 1,
    };

    const toolCallMessage: AssistantMessage = {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-1",
          name: "echo",
          arguments: { text: "first" },
        },
        {
          type: "toolCall",
          id: "call-2",
          name: "echo",
          arguments: { text: "second" },
        },
      ],
      provider: "fake",
      model: "fake-model",
      stopReason: "toolUse",
      timestamp: 2,
    };

    const finalMessage: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      provider: "fake",
      model: "fake-model",
      stopReason: "stop",
      timestamp: 3,
    };

    const modelCalls: Message[][] = [];

    const streamFn: StreamFn = (_model, context) => {
      modelCalls.push([...context.messages]);

      const message =
        modelCalls.length === 1
          ? toolCallMessage
          : finalMessage;

      const stream = createAssistantMessageEventStream();
      stream.push({ type: "start", partial: message });
      stream.push({
        type: "done",
        reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
        message,
      });
      stream.end();
      return stream;
    };

    let executeCount = 0;
    const parameters = Type.Object({ text: Type.String() });

    const echoTool: AgentTool<
      typeof parameters,
      Record<string, never>
    > = {
      name: "echo",
      label: "Echo",
      description: "Echo text.",
      parameters,
      async execute(_toolCallId, args) {
        executeCount += 1;
        return {
          content: [{ type: "text", text: args.text }],
          details: {},
        };
      },
    };

    const budget = createBudgetExtension({
      maxToolCalls: 1,
    });

    const config: AgentLoopConfig = {
      model: {
        id: "fake-model",
        provider: "fake",
        name: "Fake Model",
        contextWindow: 1000,
        maxTokens: 100,
      },
      convertToLlm(messages) {
        return [...messages];
      },
      extensions: [budget],
    };

    const newMessages = await runAgentLoop(
      [prompt],
      { messages: [], tools: [echoTool] },
      config,
      undefined,
      streamFn,
      () => {},
    );

    expect(executeCount).toBe(1);
    expect(budget.getState()).toEqual({
      modelCalls: 2,
      toolCalls: 1,
    });

    expect(
      newMessages.filter(
        (message) => message.role === "toolResult",
      ),
    ).toMatchObject([
      {
        toolCallId: "call-1",
        isError: false,
        content: [{ type: "text", text: "first" }],
      },
      {
        toolCallId: "call-2",
        isError: true,
        content: [{
          type: "text",
          text: "Budget exceeded: tool_calls limit is 1. No more tool calls will run in this task; finish now with the information you already have.",
        }],
      },
    ]);

    expect(modelCalls).toHaveLength(2);
    expect(newMessages.at(-1)).toEqual(finalMessage);
  });

  it("returns an error ToolResult when the model calls a missing tool and continues", async () => {
    const prompt: UserMessage = {
      role: "user",
      content: "现在几点？",
      timestamp: 1,
    };

    const toolCallMessage: AssistantMessage = {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-missing",
          name: "get_time",
          arguments: {},
        },
      ],
      provider: "fakes",
      model: "fakes-model",
      stopReason: "toolUse",
      timestamp: 2,
    };

    const finalMessage: AssistantMessage = {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "抱歉，我暂时无法查询时间。",
        },
      ],
      provider: "fakes",
      model: "fakes-model",
      stopReason: "stop",
      timestamp: 3,
    };

    const modelCalls: Message[][] = [];

    const streamFn: StreamFn = (_model, context) => {
      modelCalls.push([...context.messages]);

      const message =
        modelCalls.length === 1
          ? toolCallMessage
          : finalMessage;

      const stream = createAssistantMessageEventStream();
      stream.push({ type: "start", partial: message });
      stream.push({
        type: "done",
        reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
        message,
      });
      stream.end();
      return stream;
    };

    const config: AgentLoopConfig = {
      model: {
        id: "fakes-model",
        provider: "fakes",
        name: "Fake Model",
        contextWindow: 1000,
        maxTokens: 100,
      },
      convertToLlm(messages) {
        return [...messages];
      },
    };

    /*
     * context.tools 是空的，
     * 所以模型调用的 get_time 并不存在。
     */
    const context: AgentContext = {
      messages: [],
      tools: [],
    };

    const newMessages = await runAgentLoop(
      [prompt],
      context,
      config,
      undefined,
      streamFn,
      () => {},
    );

    /*
     * 1. 第一次模型调用返回 ToolCall，
     *    第二次模型调用看到错误 ToolResult 后给出最终回答。
     */
    expect(modelCalls).toHaveLength(2);

    expect(
      modelCalls[1]?.map((message) => message.role),
    ).toEqual([
      "user",
      "assistant",
      "toolResult",
    ]);

    /*
     * 2. 不存在的 Tool 要产生 isError 为 true 的 ToolResult，
     *    内容里包含 "Tool not found"。
     */
    const toolResult = newMessages.find(
      (message) => message.role === "toolResult",
    );

    expect(toolResult).toMatchObject({
      role: "toolResult",
      toolCallId: "call-missing",
      toolName: "get_time",
      isError: true,
    });

    expect(toolResult?.content).toMatchObject([
      {
        type: "text",
        text: "Tool not found: get_time",
      },
    ]);

    /*
     * 3. Agent Loop 没有中断，最终拿到了模型的回答。
     */
    expect(newMessages.at(-1)).toEqual(finalMessage);
  });
});
````

### `tests/agent.test.ts`

````typescript
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  AssistantMessage,
} from "../src/ai/types.js";

import {
  createOpenAICompatibleStreamFn,
} from "../src/ai/providers/openai-compatible.js";

import {
  createAssistantMessageEventStream,
} from "../src/ai/event-stream.js";

import {
  Agent,
} from "../src/agent/agent.js";

import type {
  AgentEvent,
  StreamFn,
} from "../src/agent/types.js";

import {
  createFakeStreamFn,
} from "./fakes/fakes-stream.js";


describe("Agent", () => {
  it("runs streamed prompt and stores conversation messages", async () => {
    const assistantMessage: AssistantMessage = {
      role: "assistant",

      content: [
        {
          type: "text",
          text: "hi",
        },
      ],

      provider: "fakes",
      model: "fakes-model",

      stopReason: "stop",

      timestamp: 2,
    };


    const streamFn: StreamFn = async () => {
      const stream =
        createAssistantMessageEventStream();


      stream.push({
        type: "start",
        partial: assistantMessage,
      });


      stream.push({
        type: "text_delta",
        contentIndex: 0,
        delta: "hi",
        partial: assistantMessage,
      });


      stream.push({
        type: "done",
        reason: "stop",
        message: assistantMessage,
      });


      stream.end();

      return stream;
    };


    const agent = new Agent({
      initialState: {
        model: {
          id: "fakes-model",
          provider: "fakes",
          name: "Fake Model",

          contextWindow: 1000,
          maxTokens: 100,
        },
      },

      loopConfig: {
        convertToLlm(messages) {
          return [...messages];
        },
      },

      streamFn,
    });


    const events: AgentEvent[] = [];


    agent.subscribe((event) => {
      events.push(event);
    });


    await agent.prompt("hello");


    expect(agent.state.isStreaming)
      .toBe(false);


    expect(agent.state.messages)
      .toHaveLength(2);


    expect(agent.state.messages[0]?.role)
      .toBe("user");


    expect(agent.state.messages[1])
      .toEqual(assistantMessage);


    expect(
      events.map((event) => event.type),
    ).toEqual([
      "agent_start",
      "turn_start",

      "message_start",
      "message_end",

      "message_start",
      "message_update",
      "message_end",

      "turn_end",
      "agent_end",
    ]);
  });

  it("streams model output through Agent events", async () => {
  const agent = new Agent({
    initialState: {
      model: {
        id: "fakes-model",
        provider: "fakes",
        name: "Fake Model",

        contextWindow: 1000,
        maxTokens: 100,
      },
    },

    loopConfig: {
      convertToLlm(messages) {
        return [...messages];
      },
    },

    // 模拟模型分两次输出："你"、"好"
    streamFn: createFakeStreamFn([
      "你",
      "好",
    ]),
  });


  const updates: string[] = [];


  agent.subscribe((event) => {
    // 只观察流式更新事件
    if (
      event.type === "message_update"
      && event.message.role === "assistant"
    ) {
      const content =
        event.message.content[0];

      if (content?.type === "text") {
        // 保存每次 partial 的完整文本
        updates.push(content.text);
      }
    }
  });


  await agent.prompt("hello");


  // 第一次 partial = "你"
  // 第二次 partial = "你好"
  expect(updates).toEqual([
    "你",
    "你好",
  ]);


  // 最终消息应该已经进入 Agent state
  const finalMessage =
    agent.state.messages[1];


  expect(finalMessage?.role)
    .toBe("assistant");


  if (finalMessage?.role !== "assistant") {
    throw new Error(
      "Expected assistant message.",
    );
  }


  expect(finalMessage.content[0])
    .toEqual({
      type: "text",
      text: "你好",
    });
});

  it("sends the system prompt first without adding it to the transcript", async () => {
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(body, { status: 200 }));

    try {
      const agent = new Agent({
        initialState: {
          model: {
            id: "fake-model",
            provider: "openai-compatible",
            name: "Fake Model",
            contextWindow: 1000,
            maxTokens: 100,
          },
          systemPrompt: "You are a test agent.",
        },

        loopConfig: {
          convertToLlm(messages) {
            return [...messages];
          },
        },

        streamFn: createOpenAICompatibleStreamFn({
          apiKey: "test-key",
          baseUrl: "https://example.com/v1",
        }),
      });

      await agent.prompt("hello");

      const requestBody = JSON.parse(
        String(fetchMock.mock.calls[0]?.[1]?.body),
      ) as {
        messages: Array<{ role: string; content: string }>;
      };

      expect(requestBody.messages[0]).toEqual({
        role: "system",
        content: "You are a test agent.",
      });

      expect(requestBody.messages[1]?.role).toBe("user");

      // system prompt 不属于 transcript
      expect(
        agent.state.messages.map((message) => message.role),
      ).toEqual(["user", "assistant"]);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
````

### `tests/budget.test.ts`

````typescript
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BudgetExceededError,
  createBudgetExtension,
} from "../src/extensions/budget.js";


describe("BudgetExtension", () => {
  it(
    "blocks calls after the configured limit",
    async () => {
      const budget =
        createBudgetExtension({
          maxModelCalls: 1,
          maxToolCalls: 1,
        });


      /*
       * 第一次允许。
       */
      await budget.hooks
        .beforeModelCall?.({
          callId: "model-0",

          turnIndex: 0,

          model: {
            id: "fake-model",
            provider: "fake",
            name: "Fake",

            contextWindow: 1000,
            maxTokens: 100,
          },

          inputMessageCount: 1,
        });


      /*
       * 第二次模型调用被挡住。
       */
        expect(() =>
          budget.hooks.beforeModelCall?.({
            callId: "model-1",
            turnIndex: 1,

            model: {
              id: "fake-model",
              provider: "fake",
              name: "Fake",
              contextWindow: 1000,
              maxTokens: 100,
            },

            inputMessageCount: 2,
          }),
        ).toThrow(BudgetExceededError);


      expect(
        budget.getState(),
      ).toEqual({
        modelCalls: 1,
        toolCalls: 0,
      });

      const toolCall = {
        type: "toolCall" as const,
        id: "call-1",
        name: "read_file",
        arguments: { path: "a.ts" },
      };

      expect(
        await budget.hooks.beforeToolCall?.({ turnIndex: 0, toolCall }),
      ).toBeUndefined();

      expect(
        await budget.hooks.beforeToolCall?.({ turnIndex: 1, toolCall }),
      ).toEqual({
        block: true,
        reason:
          "Budget exceeded: tool_calls limit is 1. No more tool calls will run in this task; finish now with the information you already have.",
      });
    },
  );
});
````

### `tests/command-approval.test.ts`

````typescript
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createCommandApprovalExtension,
} from "../src/extensions/command-approval.js";


function runCommandCall(command: string) {
  return {
    turnIndex: 0,
    toolCall: {
      type: "toolCall" as const,
      id: "call-1",
      name: "run_command",
      arguments: { command },
    },
  };
}


describe("command approval", () => {
  it("runs allowlisted commands and other tools without asking", async () => {
    const asked: string[] = [];

    const extension = createCommandApprovalExtension({
      approve: async (command) => {
        asked.push(command);
        return false;
      },
    });

    expect(
      await extension.hooks.beforeToolCall?.(runCommandCall("pnpm test")),
    ).toBeUndefined();

    expect(
      await extension.hooks.beforeToolCall?.(runCommandCall("git diff --stat")),
    ).toBeUndefined();

    expect(
      await extension.hooks.beforeToolCall?.({
        turnIndex: 0,
        toolCall: {
          type: "toolCall",
          id: "call-2",
          name: "read_file",
          arguments: { path: "package.json" },
        },
      }),
    ).toBeUndefined();

    expect(asked).toEqual([]);
  });


  it("asks for anything else, including allowlisted commands chained with others", async () => {
    const asked: string[] = [];

    const extension = createCommandApprovalExtension({
      approve: async (command) => {
        asked.push(command);
        return false;
      },
    });

    const chained = await extension.hooks.beforeToolCall?.(
      runCommandCall("git status && del src\\x.ts"),
    );

    expect(chained).toMatchObject({ block: true });

    const multiline = await extension.hooks.beforeToolCall?.(
      runCommandCall("git status\ndel src\\x.ts"),
    );

    expect(multiline).toMatchObject({ block: true });

    const output = await extension.hooks.beforeToolCall?.(
      runCommandCall('git diff "--output=patch.txt"'),
    );

    expect(output).toMatchObject({ block: true });

    const script = await extension.hooks.beforeToolCall?.(
      runCommandCall("powershell -File patch.ps1"),
    );

    expect(script).toMatchObject({ block: true });

    expect(asked).toEqual([
      "git status && del src\\x.ts",
      "git status\ndel src\\x.ts",
      'git diff "--output=patch.txt"',
      "powershell -File patch.ps1",
    ]);
  });
});
````

### `tests/compaction.test.ts`

````typescript
import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AgentMessage,
  StreamFn,
} from "../src/agent/types.js";

import type {
  AssistantMessage,
} from "../src/ai/types.js";

import {
  createAssistantMessageEventStream,
} from "../src/ai/event-stream.js";

import {
  createCompactor,
  findCutPoint,
  serializeConversation,
  type CompactionEvent,
} from "../src/context/compaction.js";


// ---------- 消息构造 ----------

function user(text: string): AgentMessage {
  return {
    role: "user",
    content: text,
    timestamp: 1,
  };
}


function callTool(
  path: string,
  usage?: { input: number; output: number },
): AgentMessage {
  return {
    role: "assistant",
    content: [{
      type: "toolCall",
      id: `call-${path}`,
      name: "read_file",
      arguments: { path },
    }],
    provider: "fake",
    model: "fake",
    stopReason: "toolUse",
    ...(usage ? { usage } : {}),
    timestamp: 1,
  };
}


function editTool(path: string): AgentMessage {
  return {
    role: "assistant",
    content: [{
      type: "toolCall",
      id: `edit-${path}`,
      name: "edit_file",
      arguments: { path, oldText: "a", newText: "b" },
    }],
    provider: "fake",
    model: "fake",
    stopReason: "toolUse",
    timestamp: 1,
  };
}


function result(
  text: string,
  isError = false,
  toolCallId = "call-1",
): AgentMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName: "read_file",
    content: [{ type: "text", text }],
    isError,
    timestamp: 1,
  };
}


function say(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    provider: "fake",
    model: "fake",
    stopReason: "stop",
    timestamp: 1,
  };
}


// ---------- C2 ----------

describe("findCutPoint", () => {
  const messages = [
    user("task"),               // 0
    callTool("a"),              // 1
    result("x".repeat(400)),    // 2
    callTool("b"),              // 3
    result("x".repeat(400)),    // 4
    callTool("c"),              // 5
    result("x".repeat(400)),    // 6
    say("done"),                // 7
  ];

  it("never cuts at a tool result and pins the turn's user message", () => {
    const cut = findCutPoint(messages, 0, 150);

    expect(cut).toEqual({
      firstKeptIndex: 5,
      turnStartIndex: 0,
    });

    expect(messages[cut.firstKeptIndex]?.role).not.toBe("toolResult");
  });


  it("reports nothing to compact when everything fits", () => {
    expect(
      findCutPoint(messages, 0, 1_000_000).firstKeptIndex,
    ).toBe(0);
  });
});


describe("serializeConversation", () => {
  it("serializes roles as text and truncates long blocks", () => {
    const text = serializeConversation([
      user("修一下测试"),
      callTool("a.ts"),
      result("y".repeat(2500)),
      result("boom", true),
    ]);

    expect(text).toContain("[User]: 修一下测试");
    expect(text).toContain(
      '[Assistant tool calls]: read_file({"path":"a.ts"})',
    );
    expect(text).toContain("[... 500 more characters truncated]");
    expect(text).not.toContain("y".repeat(2001));
    expect(text).toContain("[Tool error] read_file: boom");
  });
});


// ---------- C3 ----------

const fakeModel = {
  id: "fake",
  provider: "fake",
  name: "Fake",
  contextWindow: 1000,
  maxTokens: 100,
};


/**
 * 每次返回 SUMMARY-1、SUMMARY-2……
 * 同时记录总结请求和工具定义。
 */
function fakeSummarizer(
  stopReasons: Array<"stop" | "length"> = [],
) {
  const prompts: string[] = [];
  const toolsSeen: unknown[] = [];
  const maxTokensSeen: unknown[] = [];

  const streamFn: StreamFn = (_model, context, options) => {
    toolsSeen.push(options?.tools);
    maxTokensSeen.push(options?.maxTokens);

    const request = context.messages.find(
      (message) => message.role === "user",
    );

    prompts.push(
      request?.role === "user" && typeof request.content === "string"
        ? request.content
        : "",
    );

    const stopReason = stopReasons[prompts.length - 1] ?? "stop";

    const message: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: `SUMMARY-${prompts.length}` }],
      provider: "fake",
      model: "fake",
      stopReason,
      timestamp: 1,
    };

    const stream = createAssistantMessageEventStream();
    stream.push({ type: "start", partial: message });
    stream.push({ type: "done", reason: stopReason, message });
    stream.end();

    return stream;
  };

  return { streamFn, prompts, toolsSeen, maxTokensSeen };
}


function summaryText(message: AgentMessage | undefined): string {
  return message?.role === "user" && typeof message.content === "string"
    ? message.content
    : "";
}


describe("createCompactor", () => {
  // 超过 1000 - 200 = 800 才压缩，近期原文保留约 300 tokens。
  const settings = {
    contextWindow: 1000,
    reserveTokens: 200,
    keepRecentTokens: 300,
  };


  it("leaves the context untouched below the threshold", async () => {
    const { streamFn, prompts } = fakeSummarizer();

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
    });

    const messages = [
      user("task"),
      callTool("a.ts", { input: 300, output: 10 }),
      result("x".repeat(400), false, "call-a.ts"),
    ];

    expect(await compactor.transformContext(messages)).toBe(messages);
    expect(prompts).toHaveLength(0);
  });


  it("records only files whose tool calls succeeded", async () => {
    const { streamFn } = fakeSummarizer();

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
    });

    const messages = [
      user("task"),                                           // 0
      editTool("broken.ts"),                                  // 1
      result("oldText not found", true, "edit-broken.ts"),     // 2
      editTool("fixed.ts"),                                   // 3
      result("Edited fixed.ts at line 1.", false, "edit-fixed.ts"), // 4
      callTool("big.ts", { input: 900, output: 10 }),         // 5
      result("x".repeat(1200), false, "call-big.ts"),          // 6
    ];

    const view = await compactor.transformContext(messages);
    const summary = summaryText(view[1]);

    expect(summary).toContain(
      "<modified-files>\nfixed.ts\n</modified-files>",
    );
    expect(summary).not.toContain("broken.ts");
  });


  it("compacts once, pins the task, ignores stale usage, and updates the summary later", async () => {
    const { streamFn, prompts, toolsSeen } = fakeSummarizer();
    const events: CompactionEvent[] = [];

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
      onCompaction: (event) => {
        events.push(event);
      },
    });

    const messages: AgentMessage[] = [
      user("任务：只读，不要修改文件"),
    ];

    for (let index = 0; index < 8; index += 1) {
      messages.push(
        callTool(`f${index}.ts`, {
          input: 100 + index * 110,
          output: 10,
        }),
      );

      messages.push(
        result("x".repeat(400), false, `call-f${index}.ts`),
      );
    }

    // 第一次压缩：保留下标 13..16。
    const view = await compactor.transformContext(messages);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("<original-request>");
    expect(prompts[0]).toContain("under about 80 tokens");
    expect(prompts[0]).toContain('read_file({"path":"f0.ts"})');
    expect(prompts[0]).not.toContain('read_file({"path":"f6.ts"})');

    expect(view[0]).toBe(messages[0]);
    expect(summaryText(view[1])).toContain("SUMMARY-1");
    expect(summaryText(view[1])).toContain("f0.ts");
    expect(view.slice(2)).toEqual(messages.slice(13));

    // 追加两组没有 usage 的消息。
    // 正确估算仍低于阈值；误用旧 usage 则会再次压缩。
    for (const name of ["g0.ts", "g1.ts"]) {
      messages.push(callTool(name));
      messages.push(
        result("x".repeat(400), false, `call-${name}`),
      );
    }

    const stillView = await compactor.transformContext(messages);

    expect(prompts).toHaveLength(1);
    expect(stillView.slice(2)).toEqual(messages.slice(13));

    // 新调用带回可信 usage，再次超过阈值，更新总结。
    messages.push(
      callTool("f8.ts", { input: 950, output: 10 }),
    );
    messages.push(
      result("x".repeat(400), false, "call-f8.ts"),
    );

    const secondView = await compactor.transformContext(messages);

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("<previous-summary>");
    expect(prompts[1]).toContain("SUMMARY-1");
    expect(summaryText(secondView[1])).toContain("SUMMARY-2");
    expect(secondView.slice(2)).toEqual(messages.slice(19));
    expect(events).toHaveLength(2);

    expect(toolsSeen).toEqual([undefined, undefined]);
  });

  // 有可总结的内容（1、2），且超过阈值
  function overflowing(): AgentMessage[] {
    return [
      user("task"),                                          // 0
      callTool("a.ts"),                                      // 1
      result("x".repeat(600), false, "call-a.ts"),           // 2
      callTool("b.ts", { input: 900, output: 10 }),          // 3
      result("x".repeat(1200), false, "call-b.ts"),          // 4
    ];
  }


  it("retries once with a shorter instruction when the summary is cut off", async () => {
    const { streamFn, prompts, maxTokensSeen } =
      fakeSummarizer(["length", "stop"]);

    const events: CompactionEvent[] = [];

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
      onCompaction: (event) => {
        events.push(event);
      },
    });

    const view = await compactor.transformContext(overflowing());

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("cut off at the output limit");
    expect(summaryText(view[1])).toContain("SUMMARY-2");

    // 硬上限 = 0.8 × reserve(200)
    expect(maxTokensSeen).toEqual([160, 160]);
    expect(events).toHaveLength(1);
  });


  it("gives up after two cut-off summaries and keeps the context unchanged", async () => {
    const { streamFn, prompts } =
      fakeSummarizer(["length", "length"]);

    const errors: unknown[] = [];

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
      onError: (error) => {
        errors.push(error);
      },
    });

    const messages = overflowing();
    const view = await compactor.transformContext(messages);

    expect(prompts).toHaveLength(2);
    expect(view).toBe(messages);
    expect(errors).toHaveLength(1);
  });
});
````

### `tests/edit-file.test.ts`

````typescript
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  tmpdir,
} from "node:os";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createEditFileTool,
  MAX_SNIPPET_CHARS,
} from "../src/tools/edit-file.js";


let tempDirectory:
  string | undefined;


afterEach(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, {
      recursive: true,
      force: true,
    });

    tempDirectory = undefined;
  }
});


async function createWorkspaceWithFile(
  content: string,
): Promise<{ root: string; file: string }> {
  tempDirectory = await mkdtemp(
    join(tmpdir(), "agent-harness-"),
  );

  const file = join(tempDirectory, "a.ts");
  await writeFile(file, content, "utf8");

  return { root: tempDirectory, file };
}


describe("edit_file", () => {
  it("replaces the unique occurrence literally and keeps the rest", async () => {
    const { root, file } = await createWorkspaceWithFile(
      "const a = 1;\nconst b = 2;\n",
    );

    const tool = createEditFileTool(root);

    const result = await tool.execute("call-1", {
      path: "a.ts",
      oldText: "const b = 2;",
      // String.replace 会把 $1 当成替换模式
      newText: 'const b = "$1";',
    });

    expect(await readFile(file, "utf8")).toBe(
      'const a = 1;\nconst b = "$1";\n',
    );

    expect(result.details.line).toBe(2);
  });


  it("rejects missing or ambiguous oldText and leaves the file untouched", async () => {
    const original = "x = 1;\nx = 1;\n";
    const { root, file } = await createWorkspaceWithFile(original);

    const tool = createEditFileTool(root);

    await expect(
      tool.execute("call-1", {
        path: "a.ts",
        oldText: "x = 1;",
        newText: "x = 2;",
      }),
    ).rejects.toThrow("more than once");

    await expect(
      tool.execute("call-2", {
        path: "a.ts",
        oldText: "y = 1;",
        newText: "y = 2;",
      }),
    ).rejects.toThrow("not found");

    expect(await readFile(file, "utf8")).toBe(original);
  });


  it("matches LF oldText in a CRLF file and preserves CRLF", async () => {
    const { root, file } = await createWorkspaceWithFile(
      "line1\r\nline2\r\nline3\r\n",
    );

    const tool = createEditFileTool(root);

    await tool.execute("call-1", {
      path: "a.ts",
      oldText: "line1\nline2",
      newText: "line1\nchanged",
    });

    expect(await readFile(file, "utf8")).toBe(
      "line1\r\nchanged\r\nline3\r\n",
    );
  });

  it("edits a mixed-line-ending file without touching other lines", async () => {
    const { root, file } = await createWorkspaceWithFile(
      "a\r\nb\r\nc\nd\n",
    );

    const tool = createEditFileTool(root);

    // LF 区域：多行 oldText
    await tool.execute("call-1", {
      path: "a.ts",
      oldText: "c\nd",
      newText: "c\nX\nd",
    });

    // CRLF 区域：单行 oldText，插入的多行内容要跟随 CRLF
    await tool.execute("call-2", {
      path: "a.ts",
      oldText: "a",
      newText: "a\nA",
    });

    expect(await readFile(file, "utf8")).toBe(
      "a\r\nA\r\nb\r\nc\nX\nd\n",
    );
  });


  it("reports the edited region with three lines of context and no line-number prefixes", async () => {
    const { root } = await createWorkspaceWithFile(
      [
        "l1",
        "l2",
        "l3",
        "l4",
        "l5",
        "l6",
        "l7",
        "l8",
        "l9",
        "l10",
        "",
      ].join("\n"),
    );

    const tool = createEditFileTool(root);

    const result = await tool.execute("call-1", {
      path: "a.ts",
      oldText: "l5",
      newText: "L5",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text:
        "Edited a.ts at line 5.\n\n"
        + "[lines 2-8 of 10]\n"
        + [
          "l2",
          "l3",
          "l4",
          "L5",
          "l6",
          "l7",
          "l8",
        ].join("\n"),
    });
  });


  it("splits the snippet on CRLF without leaking carriage returns", async () => {
    const { root } = await createWorkspaceWithFile(
      "l1\r\nl2\r\nl3\r\nl4\r\nl5\r\n",
    );

    const tool = createEditFileTool(root);

    const result = await tool.execute("call-1", {
      path: "a.ts",
      oldText: "l3",
      newText: "L3",
    });

    expect(result.content[0]).toEqual({
      type: "text",
      text:
        "Edited a.ts at line 3.\n\n"
        + "[lines 1-5 of 5]\n"
        + [
          "l1",
          "l2",
          "L3",
          "l4",
          "l5",
        ].join("\n"),
    });

    expect(result.content[0]?.text).not.toContain("\r");
  });


  it("includes every line of a multi-line replacement plus context", async () => {
    const { root } = await createWorkspaceWithFile(
      [
        "m1",
        "m2",
        "m3",
        "m4",
        "m5",
        "m6",
        "m7",
        "m8",
        "m9",
        "m10",
        "m11",
        "m12",
        "",
      ].join("\n"),
    );

    const tool = createEditFileTool(root);

    const result = await tool.execute("call-1", {
      path: "a.ts",
      oldText: "m4\nm5",
      newText: "M4\nM5\nM6",
    });

    expect(result.content[0]).toEqual({
      type: "text",
      text:
        "Edited a.ts at line 4.\n\n"
        + "[lines 1-9 of 13]\n"
        + [
          "m1",
          "m2",
          "m3",
          "M4",
          "M5",
          "M6",
          "m6",
          "m7",
          "m8",
        ].join("\n"),
    });
  });


  it("truncates an overlong snippet and says so", async () => {
    const { root } = await createWorkspaceWithFile(
      "a\nb\nc\n",
    );

    const tool = createEditFileTool(root);

    const result = await tool.execute("call-1", {
      path: "a.ts",
      oldText: "b",
      newText: "x".repeat(MAX_SNIPPET_CHARS + 500),
    });

    const expectedSnippet = (
      "a\n"
      + "x".repeat(MAX_SNIPPET_CHARS + 500)
      + "\nc"
    ).slice(0, MAX_SNIPPET_CHARS);

    expect(expectedSnippet).toHaveLength(MAX_SNIPPET_CHARS);

    expect(result.content[0]).toEqual({
      type: "text",
      text:
        "Edited a.ts at line 2.\n\n"
        + "[lines 1-3 of 3]\n"
        + expectedSnippet
        + `\n… [snippet truncated to ${MAX_SNIPPET_CHARS} characters]`,
    });
  });
});
````

### `tests/event-stream.test.ts`

````typescript
import {
  describe,
  expect,
  it,
} from "vitest";

import Type from "typebox";

import type {
  AssistantMessage,
  AssistantMessageEvent,
} from "../src/ai/types.js";

import {
  createAssistantMessageEventStream,
} from "../src/ai/event-stream.js";


describe("AssistantMessageEventStream", () => {
  it("streams assistant events in order", async () => {
    const message: AssistantMessage = {
      role: "assistant",

      content: [
        {
          type: "text",
          text: "hi",
        },
      ],

      provider: "fakes",
      model: "fakes-model",

      stopReason: "stop",

      timestamp: 1,
    };


    const stream =
      createAssistantMessageEventStream();


    const events:
      AssistantMessageEvent[] = [];


    const consumer = (async () => {
      for await (const event of stream) {
        events.push(event);
      }
    })();


    stream.push({
      type: "start",
      partial: message,
    });


    stream.push({
      type: "text_delta",
      contentIndex: 0,
      delta: "hi",
      partial: message,
    });


    stream.push({
      type: "done",
      reason: "stop",
      message,
    });


    stream.end();


    await consumer;


    expect(
      events.map((event) => event.type),
    ).toEqual([
      "start",
      "text_delta",
      "done",
    ]);
  });
});
````

### `tests/extension-host.test.ts`

````typescript
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createExtensionHost,
} from "../src/agent/extension-host.js";

import type {
  AgentExtension,
} from "../src/agent/extension.js";


describe("ExtensionHost", () => {
  it("short-circuits before hooks in registration order", async () => {
    const calls: string[] = [];

    const extensions: AgentExtension[] = [
      {
        name: "first",
        hooks: {
          beforeToolCall() {
            calls.push("first");
          },
        },
      },
      {
        name: "blocker",
        hooks: {
          async beforeToolCall() {
            calls.push("blocker");
            throw new Error("blocked");
          },
        },
      },
      {
        name: "never",
        hooks: {
          beforeToolCall() {
            calls.push("never");
          },
        },
      },
    ];

    const host = createExtensionHost(extensions);

    await expect(
      host.beforeToolCall({
        turnIndex: 0,
        toolCall: {
          type: "toolCall",
          id: "call-1",
          name: "test_tool",
          arguments: {},
        },
      }),
    ).rejects.toThrow("blocked");

    expect(calls).toEqual(["first", "blocker"]);
  });

  it("stops later hooks when a tool call is blocked", async () => {
    const calls: string[] = [];

    const host = createExtensionHost([
      {
        name: "blocker",
        hooks: {
          beforeToolCall() {
            calls.push("blocker");
            return { block: true, reason: "no budget" };
          },
        },
      },
      {
        name: "later",
        hooks: {
          beforeToolCall() {
            calls.push("later");
          },
        },
      },
    ]);

    const result = await host.beforeToolCall({
      turnIndex: 0,
      toolCall: {
        type: "toolCall",
        id: "call-1",
        name: "echo",
        arguments: {},
      },
    });

    expect(result).toEqual({
      block: true,
      reason: "no budget",
    });
    expect(calls).toEqual(["blocker"]);
  });

  it("runs hooks in registration order", async () => {
    const calls: string[] = [];

    const createExtension = (name: string): AgentExtension => ({
      name,
      hooks: {
        onTurnStart() {
          calls.push(name);
        },
      },
    });

    const host = createExtensionHost([
      createExtension("a"),
      createExtension("b"),
      createExtension("c"),
    ]);

    await host.onTurnStart({ turnIndex: 0 });

    expect(calls).toEqual(["a", "b", "c"]);
  });
});
````

### `tests/fakes/fakes-stream.ts`

````typescript
import type {
  AssistantMessage,
} from "../../src/ai/types.js";

import {
  createAssistantMessageEventStream,
} from "../../src/ai/event-stream.js";

import type {
  StreamFn,
} from "../../src/agent/types.js";


/**
 * 创建一条假的 AssistantMessage。
 *
 * Fake Provider 后面会反复调用它：
 * - start 时 text = ""
 * - 第一个 delta 后 text = "你"
 * - 第二个 delta 后 text = "你好"
 * - done 时 text = "你好"
 */
function createAssistantMessage(
  provider: string,
  model: string,
  text: string,
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",

    content: [
      {
        type: "text",
        text,
      },
    ],

    provider,
    model,
    stopReason,

    timestamp: Date.now(),
  };
}


/**
 * 创建一个假的 StreamFn。
 *
 * chunks 代表模型将分几次输出文本。
 * 例如：
 * ["你", "好"]
 *
 * 最终会模拟成：
 * start → "你" → "好" → done
 */
export function createFakeStreamFn(
  chunks: string[],
): StreamFn {
  return (model, _context, _options) => {
    const stream =
      createAssistantMessageEventStream();


    // 当前累计生成出来的完整文本
    let text = "";


    // 1. 先告诉 Agent：
    // assistant message 开始生成了
    stream.push({
      type: "start",
      partial: createAssistantMessage(
        model.provider,
        model.id,
        text,
      ),
    });


    // 2. 模拟模型逐块输出文本
    for (const chunk of chunks) {
      // 例如：
      // 第一次 chunk = "你"  → text = "你"
      // 第二次 chunk = "好"  → text = "你好"
      text += chunk;


      stream.push({
        type: "text_delta",

        // 当前更新的是 content[0]
        contentIndex: 0,

        // 本次新增加的内容
        delta: chunk,

        // 当前 assistant message 的完整快照
        partial: createAssistantMessage(
          model.provider,
          model.id,
          text,
        ),
      });
    }


    // 现在暂时直接结束。
    // 下一步再补真正的 done 事件。
  // 3. 模型完整生成结束后，构造最终 AssistantMessage
  const finalMessage =
    createAssistantMessage(
      model.provider,
      model.id,
      text,
    );


  // 告诉 Agent Loop：
  // “这条 assistant message 已经生成完成。”
  stream.push({
    type: "done",
    reason: "stop",
    message: finalMessage,
  });


  // 事件全部发送完，关闭 stream
  stream.end();

  return stream;
  };
}
````

### `tests/fakes/list-directory.test.ts`

````typescript
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  tmpdir,
} from "node:os";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createListDirectoryTool,
} from "../../src/tools/list-directory.js";


let tempDirectory:
  string | undefined;


afterEach(async () => {
  if (tempDirectory) {
    await rm(
      tempDirectory,
      {
        recursive: true,
        force: true,
      },
    );

    tempDirectory =
      undefined;
  }
});


describe("list_directory", () => {
  it(
    "lists files and directories inside the workspace",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(
            tmpdir(),
            "agent-harness-",
          ),
        );


      await mkdir(
        join(
          tempDirectory,
          "src",
        ),
      );


      await writeFile(
        join(
          tempDirectory,
          "package.json",
        ),
        "{}",
        "utf8",
      );


      const tool =
        createListDirectoryTool(
          tempDirectory,
        );


      const result =
        await tool.execute(
          "call-1",
          {
            path: ".",
          },
        );


      expect(
        result.details.entries,
      ).toEqual([
        {
          name: "src",
          type: "directory",
        },
        {
          name: "package.json",
          type: "file",
        },
      ]);


      expect(
        result.content[0],
      ).toEqual({
        type: "text",
        text:
          "[DIR] src\n[FILE] package.json",
      });
    },
  );


  it(
    "rejects paths outside the workspace",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(
            tmpdir(),
            "agent-harness-",
          ),
        );


      const tool =
        createListDirectoryTool(
          tempDirectory,
        );


      await expect(
        tool.execute(
          "call-1",
          {
            path: "../",
          },
        ),
      ).rejects.toThrow(
        "outside the workspace",
      );
    },
  );

  it.runIf(process.platform === "win32")(
    "rejects a path on another drive",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(tmpdir(), "agent-harness-"),
        );

      const tool =
        createListDirectoryTool(tempDirectory);

      // 旧实现会把它当成 workspace 内路径，转去 readdir
      await expect(
        tool.execute("call-1", { path: "Z:\\" }),
      ).rejects.toThrow("outside the workspace");
    },
  );
});
````

### `tests/openai-compatible.test.ts`

````typescript
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import Type from "typebox";

import type {
  AssistantMessage,
  ToolResultMessage,
  UserMessage,
} from "../src/ai/types.js";

import {
  extractSseData,
  parseOpenAIStreamData,
  readSseBlocks,
  requestChatCompletionOnce,
  toOpenAIMessage,
  createOpenAICompatibleStreamFn,
} from "../src/ai/providers/openai-compatible.js";

/**
 * 测试用 Model。
 *
 * 不会真的调用这个模型，
 * 只是提供 Provider 请求需要的模型信息。
 */
const model = {
  id: "fake-model",
  provider: "openai-compatible",
  name: "Fake Model",

  contextWindow: 1000,
  maxTokens: 100,
};


/**
 * 测试用对话上下文。
 *
 * 相当于用户已经发送了一句：
 *
 * hello
 */
const context = {
  messages: [
    {
      role: "user" as const,
      content: "hello",
      timestamp: 1,
    },
  ],
};


/**
 * 每个测试完成之后，
 * 恢复被 vi.spyOn() 修改过的函数。
 *
 * 例如我们后面会临时替换 globalThis.fetch。
 */
afterEach(() => {
  vi.restoreAllMocks();
});


describe("toOpenAIMessage", () => {
  it("converts a user message", () => {
    const message: UserMessage = {
      role: "user",

      content: [
        {
          type: "text",
          text: "Hello ",
        },
        {
          type: "text",
          text: "Agent",
        },
      ],

      timestamp: 1,
    };


    const result =
      toOpenAIMessage(message);


    expect(result).toEqual({
      role: "user",
      content: "Hello Agent",
    });
  });


  it("converts a tool result message", () => {
    const message: ToolResultMessage = {
      role: "toolResult",

      toolCallId: "call-001",
      toolName: "read_file",

      content: [
        {
          type: "text",
          text: "file content",
        },
      ],

      isError: false,

      timestamp: 1,
    };


    const result =
      toOpenAIMessage(message);


    expect(result).toEqual({
      role: "tool",

      tool_call_id:
        "call-001",

      content:
        "file content",
    });
  });
});


describe("requestChatCompletionOnce", () => {
  it(
    "sends the expected HTTP request and returns assistant text",
    async () => {
      /**
       * 假装这是模型服务器真正返回的 HTTP Response。
       *
       * 注意：
       * 我们没有真正访问互联网。
       */
      const response = new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "hi",
              },

              finish_reason: "stop",
            },
          ],
        }),

        {
          status: 200,

          headers: {
            "Content-Type":
              "application/json",
          },
        },
      );


      /**
       * 临时替换全局 fetch。
       *
       * requestChatCompletionOnce()
       * 里面调用 fetch 时，
       * 实际拿到的是我们上面准备的 response。
       */
      const fetchMock =
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          response,
        );


      const result =
        await requestChatCompletionOnce(
          {
            apiKey: "test-key",

            /**
             * 故意带结尾的 /
             *
             * 验证 Provider 是否会自动整理 URL。
             */
            baseUrl:
              "https://example.com/v1/",
          },

          model,
          context,
        );


      /**
       * 验证模型返回文本能被正确解析。
       */
      expect(result)
        .toBe("hi");


      /**
       * 应该只调用一次 fetch。
       */
      expect(fetchMock)
        .toHaveBeenCalledTimes(1);


      /**
       * 拿到这次 fetch 实际收到的参数。
       */
      const [
        url,
        requestInit,
      ] =
        fetchMock.mock.calls[0]!;


      /**
       * 验证 URL。
       *
       * 原始：
       * https://example.com/v1/
       *
       * 最终：
       * https://example.com/v1/chat/completions
       */
      expect(url).toBe(
        "https://example.com/v1/chat/completions",
      );


      /**
       * 验证 HTTP Method。
       */
      expect(
        requestInit?.method,
      ).toBe("POST");


      /**
       * 验证 HTTP Header。
       */
      const headers =
        requestInit?.headers as
          Record<string, string>;


      expect(
        headers.Authorization,
      ).toBe(
        "Bearer test-key",
      );


      expect(
        headers["Content-Type"],
      ).toBe(
        "application/json",
      );


      /**
       * fetch body 是 JSON 字符串。
       *
       * 这里重新 parse，
       * 看 Provider 实际发送了什么。
       */
      const body = JSON.parse(
        String(
          requestInit?.body,
        ),
      ) as {
        model: string;

        messages: Array<{
          role: string;
          content: string;
        }>;

        stream: boolean;
      };


      expect(body).toEqual({
        model: "fake-model",

        messages: [
          {
            role: "user",
            content: "hello",
          },
        ],

        stream: false,
      });
    },
  );


  it(
    "throws when the provider returns an HTTP error",
    async () => {
      /**
       * 模拟服务器返回 HTTP 500。
       */
      const response =
        new Response(
          "server exploded",
          {
            status: 500,
          },
        );


      vi.spyOn(
        globalThis,
        "fetch",
      ).mockResolvedValue(
        response,
      );


      /**
       * fetch 本身不会因为 HTTP 500 自动 throw。
       *
       * 所以这里实际是在验证我们 Provider 里的：
       *
       * if (!response.ok)
       */
      await expect(
        requestChatCompletionOnce(
          {
            apiKey:
              "test-key",

            baseUrl:
              "https://example.com/v1",
          },

          model,
          context,
        ),
      ).rejects.toThrow(
        "Provider HTTP 500: server exploded",
      );
    },
  );
});

describe("extractSseData", () => {
  it("extracts JSON data from an SSE block", () => {
    const block =
      'data: {"choices":[{"delta":{"content":"你"}}]}';


    expect(
      extractSseData(block),
    ).toBe(
      '{"choices":[{"delta":{"content":"你"}}]}',
    );
  });


  it("extracts the SSE done marker", () => {
    expect(
      extractSseData(
        "data: [DONE]",
      ),
    ).toBe("[DONE]");
  });
});



describe("readSseBlocks", () => {
  it(
    "reassembles SSE blocks across arbitrary network chunks",
    async () => {
      /**
       * TextEncoder：
       *
       * string → Uint8Array
       *
       * 正好和真实 HTTP body 的数据形式一致。
       */
      const encoder =
        new TextEncoder();


      /**
       * 人为制造一个 ReadableStream。
       *
       * 注意我们故意把 SSE 消息
       * 从很奇怪的位置切开。
       */
      const body =
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"del',
              ),
            );

            controller.enqueue(
              encoder.encode(
                'ta":{"content":"你"}}]}\n\n',
              ),
            );

            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"好"}}]}\n',
              ),
            );

            controller.enqueue(
              encoder.encode(
                "\ndata: [DONE]\n\n",
              ),
            );

            controller.close();
          },
        });


      const blocks: string[] = [];


      for await (
        const block of readSseBlocks(body)
      ) {
        blocks.push(block);
      }


      /**
       * 即使网络被随意切碎，
       * 最终也应该恢复成三个完整 SSE block。
       */
      expect(blocks).toEqual([
        'data: {"choices":[{"delta":{"content":"你"}}]}',

        'data: {"choices":[{"delta":{"content":"好"}}]}',

        "data: [DONE]",
      ]);
    },
  );
});


describe("parseOpenAIStreamData", () => {
  it("parses a text delta", () => {
    const data =
      '{"choices":[{"delta":{"content":"你"},"finish_reason":null}]}';


    expect(
      parseOpenAIStreamData(data),
    ).toEqual({
      type: "text_delta",
      delta: "你",
    });
  });


  it("parses the done marker", () => {
    expect(
      parseOpenAIStreamData(
        "[DONE]",
      ),
    ).toEqual({
      type: "done",
    });
  });


  it("ignores chunks without text content", () => {
    const data =
      '{"choices":[{"delta":{},"finish_reason":null}]}';


    expect(
      parseOpenAIStreamData(data),
    ).toEqual({
      type: "ignore",
    });
  });
});


describe("createOpenAICompatibleStreamFn", () => {
  it("reports length when the output is cut off, and sends max_tokens", async () => {
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const data of [
          '{"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}',
          "[DONE]",
        ]) {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        controller.close();
      },
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(body, { status: 200 }));

    const streamFn = createOpenAICompatibleStreamFn({
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
    });

    const stream = await streamFn(model, context, { maxTokens: 50 });

    let done: AssistantMessage | undefined;
    let reason: string | undefined;

    for await (const event of stream) {
      if (event.type === "done") {
        done = event.message;
        reason = event.reason;
      }
    }

    // 以前会报 stop：截断的输出被当成完整的
    expect(reason).toBe("length");
    expect(done?.stopReason).toBe("length");

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as { max_tokens?: number };

    expect(requestBody.max_tokens).toBe(50);
  });

  it(
    "converts an HTTP SSE response into assistant stream events",
    async () => {
      const encoder =
        new TextEncoder();


      /**
       * 模拟真实服务器的 response.body。
       *
       * 服务器依次发送：
       *
       * "你"
       * "好"
       * [DONE]
       */
      const body =
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}\n\n',
              ),
            );

            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"好"},"finish_reason":null}]}\n\n',
              ),
            );

            controller.enqueue(
              encoder.encode(
                "data: [DONE]\n\n",
              ),
            );

            controller.close();
          },
        });


      /**
       * 创建假的 HTTP Response。
       *
       * 注意：
       * body 是真正的 ReadableStream，
       * 所以后面的 SSE 读取逻辑仍然是真实执行。
       */
      const response =
        new Response(
          body,
          {
            status: 200,

            headers: {
              "Content-Type":
                "text/event-stream",
            },
          },
        );


      const fetchMock =
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          response,
        );


      /**
       * 创建真正的 StreamFn。
       */
      const streamFn =
        createOpenAICompatibleStreamFn({
          apiKey: "test-key",

          baseUrl:
            "https://example.com/v1",
        });


      /**
       * 调用方式已经和 AgentLoop
       * 调 StreamFn 基本一致。
       */
      const controller =
        new AbortController();


      const weatherTool = {
        name: "get_weather",

        description:
          "Get weather for a city",

        parameters:
          Type.Object({
            city:
              Type.String(),
          }),
      };

      const stream =
        streamFn(
          model,
          context,
          {
            signal:
              controller.signal,

            tools: [
              weatherTool,
            ],
          },
        );

      const events = [];


      /**
       * StreamFn 允许：
       *
       * AssistantMessageEventStream
       *
       * 或：
       *
       * Promise<AssistantMessageEventStream>
       *
       * 所以这里 await 是安全的。
       */
      const resolvedStream =
        await stream;


      for await (
        const event of resolvedStream
      ) {
        events.push(event);
      }


      /**
       * Provider 应该把 SSE 转成：
       *
       * start
       * text_delta
       * text_delta
       * done
       */
      expect(
        events.map(
          (event) => event.type,
        ),
      ).toEqual([
        "start",
        "text_delta",
        "text_delta",
        "done",
      ]);


      /**
       * 第一段 delta：
       *
       * 新增 "你"
       * partial = "你"
       */
      const firstDelta =
        events[1];

      expect(
        firstDelta?.type,
      ).toBe(
        "text_delta",
      );

      if (
        firstDelta?.type
        !== "text_delta"
      ) {
        throw new Error(
          "Expected first text_delta event.",
        );
      }


      expect(
        firstDelta.delta,
      ).toBe("你");


      expect(
        firstDelta.partial
          .content[0],
      ).toEqual({
        type: "text",
        text: "你",
      });


      /**
       * 第二段 delta：
       *
       * 新增 "好"
       *
       * 但 partial 应该是累计后的：
       *
       * "你好"
       */
      const secondDelta =
        events[2];

      if (
        secondDelta?.type
        !== "text_delta"
      ) {
        throw new Error(
          "Expected second text_delta event.",
        );
      }


      expect(
        secondDelta.delta,
      ).toBe("好");


      expect(
        secondDelta.partial
          .content[0],
      ).toEqual({
        type: "text",
        text: "你好",
      });


      /**
       * 最终 done message
       * 也应该是完整文本。
       */
      const done =
        events[3];

      if (
        done?.type !== "done"
      ) {
        throw new Error(
          "Expected done event.",
        );
      }


      expect(
        done.message.content[0],
      ).toEqual({
        type: "text",
        text: "你好",
      });


      /**
       * 顺便确认这一次请求真的开启了：
       *
       * stream: true
       */
      const [
        ,
        requestInit,
      ] =
        fetchMock.mock.calls[0]!;


      const requestBody =
        JSON.parse(
          String(
            requestInit?.body,
          ),
        ) as {
          stream: boolean;

          tools?: Array<{
            type: string;

            function: {
              name: string;
              description: string;
              parameters: unknown;
            };
          }>;
        };


      expect(
        requestBody.stream,
      ).toBe(true);


      expect(
        requestBody.tools,
      ).toEqual([
        {
          type: "function",

          function: {
            name:
              "get_weather",

            description:
              "Get weather for a city",

            parameters:
              weatherTool.parameters,
          },
        },
      ]);
    },
  );

  it("assembles streamed tool call arguments into a ToolCall", async () => {
  const encoder = new TextEncoder();

  const chunks = [
    {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "call-1",
            type: "function" as const,
            function: {
              name: "get_weather",
              arguments: '{"city":',
            },
          }],
        },
        finish_reason: null,
      }],
    },
    {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "",
            function: {
              name: "",
              arguments: '"Nanjing"}',
            },
          }],
        },
        finish_reason: "tool_calls",
      }],
    },
  ];

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
  );

  const streamFn = createOpenAICompatibleStreamFn({
    apiKey: "test-key",
    baseUrl: "https://example.com/v1",
  });

  const stream = await streamFn(model, context, undefined);
  const events = [];

  for await (const event of stream) {
    events.push(event);
  }

  const done = events[events.length - 1];

  if (done?.type !== "done") {
    throw new Error("Expected done event.");
  }

  expect(done.reason).toBe("toolUse");
  expect(done.message.content).toEqual([
    {
      type: "toolCall",
      id: "call-1",
      name: "get_weather",
      arguments: { city: "Nanjing" },
    },
  ]);
});

  it("converts assistant tool calls", () => {
  const message: AssistantMessage = {
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id: "call-1",
        name: "get_weather",
        arguments: {
          city: "Nanjing",
        },
      },
    ],
    provider: "openai-compatible",
    model: "fake-model",
    stopReason: "toolUse",
    timestamp: 1,
  };

  expect(toOpenAIMessage(message)).toEqual({
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call-1",
        type: "function",
        function: {
          name: "get_weather",
          arguments: '{"city":"Nanjing"}',
        },
      },
    ],
  });
});

  it("reads token usage from the final usage chunk", async () => {
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const data of [
          '{"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}',
          '{"choices":[],"usage":{"prompt_tokens":1200,"completion_tokens":30,"prompt_tokens_details":{"cached_tokens":1000}}}',
          "[DONE]",
        ]) {
          controller.enqueue(
            encoder.encode(`data: ${data}\n\n`),
          );
        }

        controller.close();
      },
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(body, { status: 200 }));

    const streamFn = createOpenAICompatibleStreamFn({
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
    });

    const stream = await streamFn(model, context, undefined);

    let done: AssistantMessage | undefined;

    for await (const event of stream) {
      if (event.type === "done") {
        done = event.message;
      }
    }

    expect(done?.usage).toEqual({
      input: 1200,
      output: 30,
      cacheRead: 1000,
    });

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as { stream_options?: unknown };

    expect(requestBody.stream_options).toEqual({
      include_usage: true,
    });
  });

});
````

### `tests/read-file.test.ts`

````typescript
import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  tmpdir,
} from "node:os";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createReadFileTool,
} from "../src/tools/read-file.js";


let tempDirectory:
  string | undefined;


afterEach(async () => {
  if (tempDirectory) {
    await rm(
      tempDirectory,
      {
        recursive: true,
        force: true,
      },
    );

    tempDirectory =
      undefined;
  }
});


describe("read_file", () => {
  it(
    "reads a UTF-8 file inside the workspace",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(
            tmpdir(),
            "agent-harness-",
          ),
        );


      await writeFile(
        join(
          tempDirectory,
          "hello.txt",
        ),
        "hello agent",
        "utf8",
      );


      const tool =
        createReadFileTool(
          tempDirectory,
        );


      const result =
        await tool.execute(
          "call-1",
          {
            path:
              "hello.txt",
          },
        );


      expect(
        result.content,
      ).toEqual([
        {
          type: "text",
          text: "hello agent",
        },
      ]);
    },
  );


  it(
    "rejects paths outside the workspace",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(
            tmpdir(),
            "agent-harness-",
          ),
        );


      const tool =
        createReadFileTool(
          tempDirectory,
        );


      await expect(
        tool.execute(
          "call-1",
          {
            path:
              "../secret.txt",
          },
        ),
      ).rejects.toThrow(
        "outside the workspace",
      );
    },
  );


  it(
    "returns the first 500 lines of a long file and continues from offset",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(
            tmpdir(),
            "agent-harness-",
          ),
        );

      await writeFile(
        join(tempDirectory, "long.txt"),
        Array.from(
          { length: 1200 },
          (_, index) => `line ${index + 1}`,
        ).join("\n"),
        "utf8",
      );

      const tool =
        createReadFileTool(tempDirectory);

      const first = await tool.execute("call-1", {
        path: "long.txt",
      });

      const firstText = first.content[0]?.text ?? "";

      expect(firstText.startsWith("line 1\n")).toBe(true);
      expect(firstText).toContain("line 500\n");
      expect(firstText).not.toContain("line 501");
      expect(firstText).toContain(
        "[showing lines 1-500 of 1200; use offset=501 to read more]",
      );

      const next = await tool.execute("call-2", {
        path: "long.txt",
        offset: 501,
        limit: 2,
      });

      expect(next.content[0]?.text).toBe(
        "line 501\nline 502\n\n[showing lines 501-502 of 1200; use offset=503 to read more]",
      );
    },
  );

  it(
    "refuses to read .env but allows .env.example",
    async () => {
      tempDirectory =
        await mkdtemp(
          join(tmpdir(), "agent-harness-"),
        );

      await writeFile(
        join(tempDirectory, ".env"),
        "AGENT_API_KEY=secret",
        "utf8",
      );

      await writeFile(
        join(tempDirectory, ".env.example"),
        "AGENT_API_KEY=",
        "utf8",
      );

      const tool =
        createReadFileTool(tempDirectory);

      await expect(
        tool.execute("call-1", { path: ".env" }),
      ).rejects.toThrow("may contain secrets");

      // 绕一圈也不行
      await expect(
        tool.execute("call-2", { path: "./sub/../.env" }),
      ).rejects.toThrow("may contain secrets");

      const example = await tool.execute("call-3", {
        path: ".env.example",
      });

      expect(example.content[0]?.text).toBe("AGENT_API_KEY=");
    },
  );
});
````

### `tests/run-command.test.ts`

````typescript
import {
  mkdtemp,
  rm,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  tmpdir,
} from "node:os";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createRunCommandTool,
  decodeOutput,
  truncateTail,
} from "../src/tools/run-command.js";


let tempDirectory:
  string | undefined;


afterEach(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, {
      recursive: true,
      force: true,
      // 被 kill 的进程可能还没完全释放目录
      maxRetries: 3,
    });

    tempDirectory = undefined;
  }
});


async function createWorkspace(): Promise<string> {
  tempDirectory = await mkdtemp(
    join(tmpdir(), "agent-harness-"),
  );

  return tempDirectory;
}


describe("truncateTail", () => {
  it("keeps the end of long output", () => {
    const text = Array.from(
      { length: 500 },
      (_, index) => `line ${index}`,
    ).join("\n");

    const result = truncateTail(text, 200, 100_000);

    expect(result.truncated).toBe(true);
    expect(result.text.split("\n")).toHaveLength(200);
    expect(result.text.startsWith("line 300")).toBe(true);
    expect(result.text.endsWith("line 499")).toBe(true);
  });
});


describe("run_command", () => {
  it("returns stdout + stderr and exit code without leaking AGENT_* env", async () => {
    const root = await createWorkspace();

    const previous = process.env.AGENT_API_KEY;
    process.env.AGENT_API_KEY = "secret-value";

    try {
      const tool = createRunCommandTool(root);

      const result = await tool.execute("call-1", {
        command:
          `node -e "console.log(process.env.AGENT_API_KEY ?? 'no-key'); console.error('to-stderr'); process.exit(3)"`,
      });

      const text = result.content[0]?.text ?? "";

      expect(text).toContain("no-key");
      expect(text).toContain("to-stderr");
      expect(text).toContain("Exit code: 3");
      expect(text).not.toContain("secret-value");

      expect(result.details.exitCode).toBe(3);
      expect(result.isError).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_API_KEY;
      } else {
        process.env.AGENT_API_KEY = previous;
      }
    }
  });


  it(
    "kills the whole process tree on timeout",
    { timeout: 15_000 },
    async () => {
      const root = await createWorkspace();
      const tool = createRunCommandTool(root);

      // cmd.exe → node：只 kill cmd.exe 的话，这里会一直卡住
      const result = await tool.execute("call-1", {
        command: `node -e "setInterval(function () {}, 1000)"`,
        timeoutSeconds: 1,
      });

      expect(result.details.timedOut).toBe(true);
      expect(result.content[0]?.text).toContain("timed out");
    },
  );
});


describe("decodeOutput", () => {
  it.runIf(process.platform === "win32")(
    "decodes UTF-8 and GBK lines in the same output",
    () => {
      // "找不到文件" 的 GBK 编码：就是之前乱码 "�Ҳ����ļ�" 的原始字节
      const gbk = Buffer.from([
        0xd5, 0xd2, 0xb2, 0xbb, 0xb5, 0xbd, 0xce, 0xc4, 0xbc, 0xfe,
      ]);

      const output = Buffer.concat([
        Buffer.from("✓ F:/学习资料\r\n", "utf8"),
        gbk,
        Buffer.from("\r\n"),
      ]);

      expect(decodeOutput(output)).toBe(
        "✓ F:/学习资料\r\n找不到文件\r\n",
      );
    },
  );
});
````

### `tests/run-status.type-test.ts`

````typescript
import type {
  RunResult,
  RunStatus,
} from "../src/core/run-status.js";


const succeeded: RunStatus = "SUCCEEDED";

const failed: RunStatus = "FAILED";

const needsHuman: RunStatus = "NEEDS_HUMAN";

const cancelled: RunStatus = "CANCELLED";


// @ts-expect-error RECOVERED 不是最终 RunStatus
const recovered: RunStatus = "RECOVERED";


// @ts-expect-error EXECUTION_ERROR 属于 ActionResult<ExampleOutcome>，不属于 RunStatus
const executionError: RunStatus = "EXECUTION_ERROR";


const result: RunResult = {
  runId: "run-001",
  status: "SUCCEEDED",
};


void [
  succeeded,
  failed,
  needsHuman,
  cancelled,
  recovered,
  executionError,
  result,
];
````

### `tests/search-text.test.ts`

````typescript
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  tmpdir,
} from "node:os";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createSearchTextTool,
} from "../src/tools/search-text.js";


let tempDirectory:
  string | undefined;


afterEach(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, {
      recursive: true,
      force: true,
    });

    tempDirectory = undefined;
  }
});


async function createWorkspace(): Promise<string> {
  tempDirectory = await mkdtemp(
    join(tmpdir(), "agent-harness-"),
  );

  return tempDirectory;
}


describe("search_text", () => {
  it("matches plain text literally and skips ignored dirs and binary files", async () => {
    const root = await createWorkspace();

    await mkdir(join(root, "src"));
    await mkdir(join(root, "node_modules"));

    await writeFile(
      join(root, "src", "a.ts"),
      "const fooXbar = 1;\nfoo.bar(baz);\n",
      "utf8",
    );

    await writeFile(
      join(root, "node_modules", "dep.js"),
      "foo.bar(baz);\n",
      "utf8",
    );

    await writeFile(
      join(root, "image.bin"),
      Buffer.concat([
        Buffer.from([0]),
        Buffer.from("foo.bar(baz);"),
      ]),
    );

    const tool = createSearchTextTool(root);

    // 按正则 "foo.bar(" 会报错；按正则 "foo.bar" 还会误中 fooXbar
    const result = await tool.execute("call-1", {
      pattern: "foo.bar(",
    });

    expect(result.details.matches).toEqual([
      {
        path: "src/a.ts",
        line: 2,
        text: "foo.bar(baz);",
      },
    ]);

    expect(result.content[0]).toEqual({
      type: "text",
      text: "src/a.ts:2: foo.bar(baz);",
    });
  });


  it("truncates results and tells the model", async () => {
    const root = await createWorkspace();

    await writeFile(
      join(root, "many.txt"),
      Array.from({ length: 150 }, () => "hit").join("\n"),
      "utf8",
    );

    const tool = createSearchTextTool(root);

    const result = await tool.execute("call-1", {
      pattern: "hit",
    });

    expect(result.details.matches).toHaveLength(100);
    expect(result.details.truncated).toBe(true);

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("results truncated");
  });
});
````

### `tests/token-estimate.test.ts`

````typescript
import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AssistantMessage,
  ToolResultMessage,
} from "../src/ai/types.js";

import {
  estimateContextTokens,
  estimateTextTokens,
} from "../src/context/token-estimate.js";


function assistant(
  input: number,
  output: number,
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "ok" }],
    provider: "fake",
    model: "fake",
    stopReason,
    usage: { input, output },
    timestamp: 1,
  };
}


function toolResult(text: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read_file",
    content: [{ type: "text", text }],
    isError: false,
    timestamp: 1,
  };
}


describe("estimateTextTokens", () => {
  it("counts ASCII by /3 and non-ASCII 1:1", () => {
    expect(estimateTextTokens("abcdefgh")).toBe(3);
    expect(estimateTextTokens("你好世界")).toBe(4);
    expect(estimateTextTokens("abcd你好")).toBe(4);
  });
});


describe("estimateContextTokens", () => {
  it("uses the last trusted usage plus trailing estimates", () => {
    const messages = [
      assistant(1000, 50),
      toolResult("x".repeat(400)),
      assistant(2000, 80),
      toolResult("y".repeat(40)),
      assistant(9999, 1, "error"),
    ];

    // 最后一条可信的是 index 2：2000 + 80，之后 toolResult ≈ 14，错误消息 ≈ 1
    expect(estimateContextTokens(messages)).toEqual({
      tokens: 2080 + 14 + 1,
      usageTokens: 2080,
      trailingTokens: 15,
    });

    expect(
      estimateContextTokens(messages, 3).usageTokens,
    ).toBe(0);
  });
});
````

### `tests/write-file.test.ts`

````typescript
import {
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  join,
  resolve,
} from "node:path";
import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createWriteFileTool,
} from "../src/tools/write-file.js";

let root: string | undefined;

afterEach(async () => {
  if (root) {
    await rm(root, {
      recursive: true,
      force: true,
    });
    root = undefined;
  }
});

async function createWorkspace(): Promise<string> {
  root = await mkdtemp(
    join(tmpdir(), "agent-write-file-"),
  );
  return root;
}

describe("write_file", () => {
  it("creates a new file and missing parent directories", async () => {
    const root = await createWorkspace();
    const tool = createWriteFileTool(root);

    const result = await tool.execute("call-1", {
      path: "src/new/hello.ts",
      content: "hello",
    });

    expect(
      await readFile(join(root, "src", "new", "hello.ts"), "utf8"),
    ).toBe("hello");

    expect(result.details.created).toBe(true);
  });

  it("rejects paths outside the workspace", async () => {
    const root = await createWorkspace();
    const tool = createWriteFileTool(root);

    await expect(
      tool.execute("call-1", { path: "../outside.txt", content: "x" }),
    ).rejects.toThrow("outside the workspace");

    // 另一个盘符 / UNC 路径：旧的检查会放行它
    if (process.platform === "win32") {
      await expect(
        tool.execute("call-2", {
          path: "\\\\server\\share\\x.txt",
          content: "x",
        }),
      ).rejects.toThrow("outside the workspace");
    }

    await expect(
      stat(resolve(root, "..", "outside.txt")),
    ).rejects.toThrow();
  });
});
````

### `README.md`

````markdown
# agent-harness

一个**学习用途的 TypeScript coding agent runtime**，实验性质。

它提供一个 CLI 命令 `agent-harness`：在（必须是）Git 仓库里跑一个 agent loop，模型可以调用文件工具和 shell 命令来完成任务，并且会在终端里告诉你做了什么、花了多少 token。

> 实验项目，不是产品：接口、行为和目录结构都还在变，也没有做安全隔离。请只在你愿意随时回滚的仓库里试。

---

## 环境要求

- **Node.js**：CLI 用到了 `process.loadEnvFile`，需要 Node ≥ 20.12
- **pnpm**：`package.json` 的 `packageManager` 固定为 `pnpm@12.5.1`
- **git**：CLI 启动时会检查工作目录是不是 Git 仓库

## 安装

在仓库根目录：

```bash
pnpm install
pnpm build
```

`pnpm build` 用 `tsc -p tsconfig.build.json` 把 `src/` 编译到 `dist/`，入口是 `dist/cli.js`（也就是 `package.json` 里的 `bin`）。项目是 ESM（`"type": "module"`）。

## 配置

配置默认放在**主目录**下的 `.agent-harness.env`：

- macOS/Linux：`~/.agent-harness.env`
- Windows：`C:\Users\<你的用户名>\.agent-harness.env`

放在主目录而不是项目里，是为了让 key 不落在被 agent 修改的仓库中。也可以用 `--env-file <path>` 指定别的文件（指定了但文件不存在会直接报错退出）。

需要的变量：

| 变量 | 是否必需 | 用途 |
| --- | --- | --- |
| `AGENT_API_KEY` | 必需 | 作为 `Authorization: Bearer <key>` 发给模型 API |
| `AGENT_BASE_URL` | 必需 | API 基础地址；CLI 请求 `${AGENT_BASE_URL}/chat/completions`（结尾的 `/` 会被去掉） |
| `AGENT_MODEL` | 不传 `-m/--model` 时必需 | 模型 ID |

文件内容示例（将 API 地址、模型 ID 和占位 Key 替换为你自己的配置）：

```env
AGENT_API_KEY=[占位值已移除]
AGENT_BASE_URL=https://api.deepseek.com
AGENT_MODEL=deepseek-v4-flash
```

几点说明：

- 这些变量也可以直接作为环境变量提供（`export AGENT_API_KEY=...` / `$env:AGENT_API_KEY="..."`）。**已经存在的环境变量优先**，不会被 env 文件里的同名变量覆盖。
- `run_command` 启动子进程时会把所有 `AGENT_` 开头的变量删掉，不会把 key 交给模型能执行的命令。
- 仓库根目录的 `.env` **不是** CLI 读的那份（CLI 只读主目录的 env 文件或 `--env-file`）。`src/examples/` 下的示例是从 `process.env` 读配置的。

## 注册 agent-harness 命令

不想全局安装的话，直接用 `node <仓库>/dist/cli.js "任务"` 也行。下面是两种注册方式。

### 方式一：用 `package.json` 的 `bin` 字段全局安装（Windows / macOS / Linux 通用）

在仓库根目录执行：

```bash
pnpm add -g .
```

这会把 `agent-harness` 装进 pnpm 的全局 bin 目录（Windows 上会生成 `agent-harness`、`agent-harness.cmd`、`agent-harness.ps1` 三个 shim）。前提是那个目录在 `PATH` 里，否则会报：

```
Error: ERR_PNPM_GLOBAL_BIN_DIR_NOT_IN_PATH
help: Run "pnpm setup" to update your shell configuration.
```

遇到这个就按提示跑 `pnpm setup`，然后重开终端。卸载用 `pnpm remove -g agent-harness`。

注意：pnpm 12 里 `pnpm link --global` 已经不可用（会报 `unexpected argument '--global'`），用上面的 `pnpm add -g .`。

### 方式二：Windows PowerShell 里加一个函数

编辑你的 profile（`$PROFILE` 指向的文件，不存在就先 `New-Item -Path $PROFILE -ItemType File -Force`），加上：

```powershell
function agent-harness {
  node "F:\path\to\agent-harness\dist\cli.js" @args
}
```

重开 PowerShell，或者 `. $PROFILE` 让它立即生效。

### 方式三：macOS/Linux 加一个 alias

写进 `~/.zshrc`（bash 用户写 `~/.bashrc`）：

```bash
alias agent-harness="node /path/to/agent-harness/dist/cli.js"
```

然后 `source ~/.zshrc`。

## 用法和选项

```bash
agent-harness "修复 tests/foo.test.ts 里失败的测试"
agent-harness -w ../some-repo "解释 src/agent/agent-loop.ts 的用途"
agent-harness -m deepseek-chat "跑一遍测试，并说明失败原因"
```

选项（`agent-harness --help` 的输出）：

| 选项 | 说明 |
| --- | --- |
| `-w, --workspace <dir>` | 工作目录，默认当前目录。目录必须存在，而且必须在 Git 仓库里 |
| `-m, --model <id>` | 模型 ID，覆盖 `AGENT_MODEL` |
| `--env-file <path>` | API 配置文件，默认主目录的 `.agent-harness.env` |
| `-h, --help` | 显示帮助 |

任务描述是位置参数：多个位置参数会用空格拼成一个任务；任务为空时打印帮助并以退出码 1 退出。所有文件工具的相对路径都相对 workspace 根目录，`run_command` 也在 workspace 根目录执行。

agent 可用的工具：`list_directory`、`read_file`、`search_text`、`write_file`、`edit_file`、`run_command`。

运行时你会看到：

- 启动时打印 `workspace` / `model` / `task`
- 每轮结束时打印模型输出的 `[assistant] ...` 文本；`run_command` 的输出会单独成块打印
- 结束时打印模型调用次数、执行过的工具名，以及 token 用量（`input` / `cachedInput` / `output` / `peakInput`）
- 内置预算：最多 **30 次模型调用**、**50 次工具调用**，超出后停止并打印 `[stopped] ...`

退出码：正常结束为 `0`（包括触发预算上限），被 Ctrl+C 中止为 `130`。第一次 Ctrl+C 会中止 agent 并杀掉正在运行的命令，再按一次强制退出。

## 安全须知

请把 `run_command` 当成「你自己在终端里敲这条命令」来对待。

- **只在 Git 仓库里运行。** 启动时用 `git status --porcelain` 检查工作目录；不在 Git 仓库里（或没装 git）就直接退出。这样 agent 的改动才能用 `git diff` 审查、用 `git restore` 回滚。
- **运行前先 commit。** 工作区有未提交改动时只会打印一条警告，不会阻止你。先 commit 才能把 agent 的改动和你的改动分开审查。
- **白名单外的命令需要确认。** 只有下面这些命令可以不问就执行（前缀匹配）：
  `pnpm test`、`pnpm typecheck`、`pnpm build`、`git status`、`git diff`、`git log`、`git show`。
  包含 `;` `&` `|` `<` `>` `` ` `` `$` `(` `)` `^` `%` 或换行的命令（能串联命令、重定向、展开变量）一律要确认；带 `--output` 的一律要确认（`git diff --output` 会写文件）。确认提示默认是 `N`，只有在终端里手输 `y` 才放行；非交互环境（stdin 不是 TTY）一律拒绝。
  **这不是安全隔离**：白名单里的 `pnpm test` 会执行测试文件，模型可以先写文件再执行。它的作用是防意外，并让每条命令都在你眼前经过。
- **`run_command` 没有沙箱。** 它用 `shell: true` 执行，Windows 是 `cmd.exe`，macOS/Linux 是 `/bin/sh`，工作目录是 workspace 根目录。它只能删掉子进程环境里的 `AGENT_*` 变量，除此之外几乎没有限制：能读写你账号能读写的任何东西。命令不能读交互输入（stdin 是 `ignore`）；默认超时 60 秒（可用 `timeoutSeconds` 调到最多 600 秒），超时会连整棵进程树一起杀掉；返回给模型的输出只保留最后 200 行 / 20000 字符。
- **文件工具被限制在 workspace 内。** 路径相对 workspace 根目录解析，指向 workspace 之外的路径会被拒绝；路径中现有组成部分的符号链接会被检查并拒绝。这是路径检查，不是操作系统级安全隔离，也不能防止检查后路径被其他进程替换。
- **用 `git diff` 审查改动，不满意就 `git restore .` 回滚。** CLI 不会自动提交，结束提示也会提醒你这么做；system prompt 里也禁止模型执行 `commit` / `push` / `reset` / `checkout` / `rebase` / `clean` 这类会改历史、分支或远程的命令。

## 开发

```bash
pnpm install       # 安装依赖
pnpm build         # 编译到 dist/（tsconfig.build.json）
pnpm typecheck     # 只做类型检查，不产出（tsconfig.json，包含 tests/）
pnpm test          # vitest run
pnpm test:watch    # vitest watch
```

- `tsconfig.json` 是 `noEmit` 的类型检查配置，覆盖 `src/` 和 `tests/`；`tsconfig.build.json` 继承它并输出到 `dist/`。
- 测试在 `tests/`（vitest）。

代码结构：

| 目录 | 内容 |
| --- | --- |
| `src/cli.ts` | CLI：参数解析、env 文件、Git 检查、命令确认、终端输出 |
| `src/agent/` | Agent、agent loop、extension 与 hook 机制 |
| `src/ai/` | 统一消息类型、事件流，`src/ai/providers/openai-compatible.ts` 是 OpenAI-compatible provider |
| `src/tools/` | 六个工具：list_directory、read_file、search_text、write_file、edit_file、run_command |
| `src/extensions/` | `budget.ts`（调用次数预算）、`command-approval.ts`（命令白名单与确认） |
| `src/prompts/` | coding system prompt |
| `src/logging/`、`src/trace/` | 日志输出、trace 采集 |
| `src/examples/` | 直接调用 API 的小例子（从 `process.env` 读 `AGENT_*` 配置） |
````

