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