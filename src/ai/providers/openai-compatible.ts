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
  ThinkingContent,
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

  /**
   * 合并进请求体的额外字段（Provider 特有参数，例如 DeepSeek 的 thinking）。
   * 标准字段（model、messages、stream 等）写在后面，不会被它覆盖。
   */
  extraBody?: Record<string, unknown>;
};


/** 错误正文的上限：网关可能返回整页 HTML，原样打印会刷屏，还会写进会话 */
const MAX_ERROR_BODY_CHARS = 2000;


function httpErrorMessage(
  status: number,
  body: string,
): string {
  const shown =
    body.length > MAX_ERROR_BODY_CHARS
      ? `${body.slice(0, MAX_ERROR_BODY_CHARS)}… [${body.length - MAX_ERROR_BODY_CHARS} more characters truncated]`
      : body;

  return `Provider HTTP ${status}: ${shown}`;
}


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

  /**
   * 只有 assistant 消息有：推理模型的思考过程（DeepSeek）。
   * 开启 thinking 且带工具时，之后每次请求都必须原样回传，否则 400。
   */
  reasoning_content?: string;
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

      const reasoning = message.content
        .filter(
          (item): item is ThinkingContent =>
            item.type === "thinking",
        )
        .map((item) => item.thinking)
        .join("");

      const toolCalls = message.content.filter(
        (item): item is ToolCall =>
          item.type === "toolCall",
      );

      const result: OpenAIChatMessage =
        toolCalls.length === 0
          ? {
              role: "assistant",
              content: text,
            }
          : {
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

      // 只在真的有思考过程时才带上：其他 Provider 不认识这个字段
      if (reasoning.length > 0) {
        result.reasoning_content = reasoning;
      }

      return result;
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

      /** 到目前为止的完整思考过程 */
      let fullReasoning = "";

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
            ...(config.extraBody ?? {}),
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
            httpErrorMessage(response.status, body),
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

          const reasoningDelta = extractReasoningDelta(data);

          if (reasoningDelta) {
            fullReasoning += reasoningDelta;
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

              addThinking(message, fullReasoning);


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

        addThinking(message, fullReasoning);

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
      httpErrorMessage(response.status, body),
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
 * 取出 chunk 里的思考过程增量（DeepSeek：delta.reasoning_content）。
 * 和 extractOpenAIUsage 一样单独提取，不改 parseOpenAIStreamData：
 * 同一个 chunk 里可能既有 reasoning_content 又有 content，不能只返回一种。
 */
export function extractReasoningDelta(
  data: string,
): string | undefined {
  if (data === "[DONE]") {
    return undefined;
  }

  try {
    const chunk = JSON.parse(data) as {
      choices?: Array<{ delta?: { reasoning_content?: string | null } }>;
    };

    const reasoning = chunk.choices?.[0]?.delta?.reasoning_content;

    // 第一个 chunk 是空字符串，跳过
    return typeof reasoning === "string" && reasoning.length > 0
      ? reasoning
      : undefined;
  } catch {
    return undefined;
  }
}


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



/** 有思考过程就放在内容最前面：回传时按原样还原成 reasoning_content */
function addThinking(
  message: AssistantMessage,
  reasoning: string,
): void {
  if (reasoning.length > 0) {
    message.content.unshift({
      type: "thinking",
      thinking: reasoning,
    });
  }
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
