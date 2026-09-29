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