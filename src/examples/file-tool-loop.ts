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
