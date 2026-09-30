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