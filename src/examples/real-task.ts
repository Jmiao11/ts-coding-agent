import {
  spawnSync,
} from "node:child_process";

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
  BudgetExceededError,
  createBudgetExtension,
} from "../extensions/budget.js";

import {
  createLoggerExtension,
} from "../logging/logger-extension.js";

import {
  createCodingSystemPrompt,
} from "../prompts/coding-system-prompt.js";

import {
  createEditFileTool,
} from "../tools/edit_file.js";

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
} from "../tools/write_file.js";


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

// node real-task.js "修复失败的测试"
// process.argv[0] // Node.js 可执行文件的路径
// process.argv[1] // 当前运行的脚本路径
// process.argv[2] // 用户传给脚本的第一个参数
// .slice(2) 是数组方法：从索引 2 开始，取出后面的所有元素，组成一个新数组。原数组不变。
const task =
  process.argv.slice(2).join(" ").trim();

if (task.length === 0) {
  console.error(
    '用法：node --env-file=.env dist/examples/real-task.js "任务描述"',
  );
  process.exit(1);
}

const apiKey = requiredEnv("AGENT_API_KEY");
const baseUrl = requiredEnv("AGENT_BASE_URL");
const modelId = requiredEnv("AGENT_MODEL");

const workspaceRoot = process.cwd();


// 有未提交改动时提醒：Agent 的改动会和你的改动混在一起，难以单独回滚
const gitStatus = spawnSync(
  "git",
  ["status", "--porcelain"],
  {
    cwd: workspaceRoot,
    encoding: "utf8",
  },
);

if (gitStatus.stdout.trim().length > 0) {
  console.warn(
    "⚠ 工作区有未提交的改动，建议先 commit，方便单独审查和回滚 Agent 的改动。\n",
  );
}


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
console.log(
  "system prompt:",
  `${agent.state.systemPrompt.length} chars`,
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

console.log("\n模型调用次数：", modelCallCount);
console.log("执行过的工具：", executedTools);
console.log(
  "\n请人工检查：git diff，然后自己运行 pnpm test。",
);