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