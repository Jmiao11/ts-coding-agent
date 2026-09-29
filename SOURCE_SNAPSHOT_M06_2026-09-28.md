# Agent Harness Source Snapshot

## 1. Snapshot

- 时间：2026-09-28T13:16:12+08:00
- branch：master
- git status --short（生成快照前）：

````text
AM .env
A  .idea/.gitignore
A  .idea/agent-harness.iml
A  .idea/inspectionProfiles/Project_Default.xml
A  .idea/inspectionProfiles/profiles_settings.xml
A  .idea/misc.xml
A  .idea/modules.xml
A  .idea/vcs.xml
AM dist/agent/agent-loop.js
AM dist/agent/agent.js
AM dist/agent/extension-host.js
A  dist/agent/extension.js
A  dist/agent/hooks.js
AM dist/agent/types.js
AM dist/ai/event-stream.js
AM dist/ai/providers/openai-compatible.js
AM dist/ai/types.js
A  dist/core/action-result.js
A  dist/core/run-status.js
A  dist/examples/non-streaming.js
A  dist/examples/streaming.js
AM dist/examples/tool-calling.js
AM dist/extensions/budget.js
A  dist/logging/logger-extension.js
AD dist/logging/logger-hooks.js
AD dist/src/agent/agent-loop.js
AD dist/src/agent/agent.js
AD dist/src/agent/types.js
AD dist/src/ai/event-stream.js
AD dist/src/ai/types.js
AD dist/src/core/action-result.js
AD dist/src/core/run-status.js
AD dist/tests/action-result.type-test.js
AD dist/tests/agent-loop.test.js
AD dist/tests/agent.test.js
AD dist/tests/event-stream.test.js
AD dist/tests/run-status.type-test.js
A  dist/tools/read-file.js
AM dist/trace/trace-collector.js
A  dist/trace/trace-extension.js
AD dist/trace/trace-hooks.js
A  dist/trace/types.js
AM note.md
AM openai-stream-explainer.html
AM src/agent/agent-loop.ts
AM src/agent/agent.ts
AM src/agent/extension-host.ts
A  src/agent/extension.ts
AM src/agent/hooks.ts
AM src/agent/types.ts
AM src/ai/event-stream.ts
AM src/ai/providers/openai-compatible.ts
AM src/ai/types.ts
AM src/core/action-result.ts
AM src/core/run-status.ts
AM src/examples/file-tool-loop.ts
AM src/examples/non-streaming.ts
AM src/examples/streaming.ts
AM src/examples/tool-calling.ts
AM src/extensions/budget.ts
A  src/logging/logger-extension.ts
AD src/logging/logger-hooks.ts
AM src/tools/list-directory.ts
AM src/tools/read-file.ts
AM src/trace/trace-collector.ts
A  src/trace/trace-extension.ts
AD src/trace/trace-hooks.ts
AM src/trace/types.ts
AM tests/action-result.type-test.ts
AM tests/agent-loop.test.ts
AM tests/agent.test.ts
AM tests/budget.test.ts
AM tests/event-stream.test.ts
AM tests/extension-host.test.ts
A  tests/fakes/fakes-stream.ts
AM tests/fakes/list-directory.test.ts
AM tests/openai-compatible.test.ts
AM tests/read-file.test.ts
AM tests/run-status.type-test.ts
AM tsconfig.build.json
?? dist/examples/file-tool-loop.js
?? dist/tools/list-directory.js
?? node_modules/
?? package.json
?? pnpm-lock.yaml
?? tsconfig.json
````

- pnpm test：PASS（已安装 pnpm 12.5.1）

````text
 Test Files  8 passed (8)
      Tests  28 passed (28)
   Start at  13:13:57
   Duration  652ms (import 80%, transform 13%, tests 5%, worker 2%)
````

- pnpm build：PASS（--outDir 指向临时目录）

## 2. Current M06 Reality Check

| 项目 | 状态 | 证据文件 |
| --- | --- | --- |
| TraceCollector | 存在 | `src/trace/trace-collector.ts` |
| AgentLoop 直接依赖 TraceCollector | 否 | `src/agent/agent-loop.ts` |
| beforeToolCall Hook | 存在 | `src/agent/hooks.ts` |
| ExtensionHost | 存在 | `src/agent/extension-host.ts` |
| AgentExtension | 存在 | `src/agent/extension.ts` |
| Logger Hook/Extension | 存在 | `src/logging/logger-extension.ts` |
| Budget | 存在 | `src/extensions/budget.ts` |
| Budget 使用 throw | 是 | `src/extensions/budget.ts` |
| Budget 使用 { block, reason } | 否 | `src/extensions/budget.ts` |

## 3. Project Tree

````text
src/agent/agent-loop.ts
src/agent/agent.ts
src/agent/extension-host.ts
src/agent/extension.ts
src/agent/hooks.ts
src/agent/types.ts
src/ai/event-stream.ts
src/ai/providers/openai-compatible.ts
src/ai/types.ts
src/core/action-result.ts
src/core/run-status.ts
src/examples/file-tool-loop.ts
src/examples/non-streaming.ts
src/examples/streaming.ts
src/examples/tool-calling.ts
src/extensions/budget.ts
src/logging/logger-extension.ts
src/tools/list-directory.ts
src/tools/read-file.ts
src/trace/trace-collector.ts
src/trace/trace-extension.ts
src/trace/types.ts
tests/action-result.type-test.ts
tests/agent-loop.test.ts
tests/agent.test.ts
tests/budget.test.ts
tests/event-stream.test.ts
tests/extension-host.test.ts
tests/fakes/fakes-stream.ts
tests/fakes/list-directory.test.ts
tests/openai-compatible.test.ts
tests/read-file.test.ts
tests/run-status.type-test.ts
package.json
tsconfig.json
tsconfig.build.json
````

## 4. Build Config

### package.json

````json
{
  "name": "agent-harness",
  "version": "1.0.0",
  "description": "",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
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

### tsconfig.json

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

### tsconfig.build.json

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

## 5. AI Layer

### src/ai/types.ts

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
  messages: Message[];
};


export type SimpleStreamOptions = {
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

### src/ai/event-stream.ts

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

### src/ai/providers/openai-compatible.ts

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
            messages: context.messages.map(
              toOpenAIMessage,
            ),

            ...(options?.tools?.length
            ? {
                tools: options.tools.map(
                  toOpenAITool,
                ),
              }
            : {}),

            stream: true,
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
                  : "stop";

              const message = createAssistantMessage(
                model,
                fullText,
                reason,
                undefined,
                toolCalls,
              );


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
          toolCalls.length > 0 ? "toolUse" : "stop";

        const message = createAssistantMessage(
          model,
          fullText,
          reason,
          undefined,
          toolCalls,
        );

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

      messages:
        context.messages.map(
          toOpenAIMessage,
        ),

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

## 6. Agent Core

### src/agent/agent-loop.ts

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
  await extensionHost.beforeToolCall({
    turnIndex,
    toolCall,
  });

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

### src/agent/types.ts

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

### src/agent/agent.ts

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

### src/agent/hooks.ts

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
  ): MaybePromise<void>;

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

### src/agent/extension-host.ts

````typescript
import type {
  AssistantMessage,
  Model,
  ToolCall,
} from "../ai/types.js";

import type {
  AgentRunStatus,
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
  }): Promise<void>;

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
        await extension.hooks.beforeToolCall?.(input);
      }
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

### src/agent/extension.ts

````typescript
import type {
  AgentLoopHooks,
} from "./hooks.js";


export type AgentExtension = {
  name: string;
  hooks: AgentLoopHooks;
};
````

## 7. Tools

### src/tools/read-file.ts

````typescript
import {
  readFile,
} from "node:fs/promises";

// node: 前缀明确表示使用 Node.js 内置模块
import {
  relative,
  resolve,
} from "node:path";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";


// 定义 Tool 参数 Schema
const readFileParameters =
  Type.Object(
    {
      path: Type.String({
        minLength: 1,
      }),
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
};


export function createReadFileTool(
  workspaceRoot: string,
): AgentTool<
  typeof readFileParameters,
  ReadFileDetails
> {
  const root =
    resolve(workspaceRoot);


  return {
    name: "read_file",

    label: "Read File",

    description:
      "Read a UTF-8 text file inside the workspace. The path must be relative to the workspace root.",

    parameters:
      readFileParameters,


    async execute(
      _toolCallId,
      parameters,
    ) {
      const absolutePath =
        resolve(
          root,
          parameters.path,
        );


      /*
       * 防止：
       *
       * ../../secret.txt
       *
       * 逃出 workspace。
       */
      const relativePath =
        relative(
          root,
          absolutePath,
        );


      if (
        relativePath === ".."
        || relativePath.startsWith(
          `..${process.platform === "win32"
            ? "\\"
            : "/"
          }`,
        )
        || resolve(
          absolutePath,
        ) === root
      ) {
        throw new Error(
          `Path is outside the workspace or is not a file: ${parameters.path}`,
        );
      }


      const content =
        await readFile(
          absolutePath,
          "utf8",
        );


      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],

        details: {
          path:
            relativePath,

          bytes:
            Buffer.byteLength(
              content,
              "utf8",
            ),
        },
      };
    },
  };
}
````

### src/tools/list-directory.ts

````typescript
import {
  readdir,
} from "node:fs/promises";

import {
  relative,
  resolve,
} from "node:path";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";


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


      const absolutePath =
        resolve(
          root,
          requestedPath,
        );


      const relativePath =
        relative(
          root,
          absolutePath,
        );


      /*
       * 禁止：
       *
       * ../
       * ../../
       *
       * 逃出 workspace。
       *
       * 但这里允许 "."，
       * 因为列 workspace 根目录是正常需求。
       */
      if (
        relativePath === ".."
        || relativePath.startsWith(
          `..${process.platform === "win32"
            ? "\\"
            : "/"
          }`,
        )
      ) {
        throw new Error(
          `Path is outside the workspace: ${requestedPath}`,
        );
      }


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
            relativePath || ".",

          entries,
        },
      };
    },
  };
}
````

## 8. Trace / Extension / Budget

### src/trace/types.ts

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

### src/trace/trace-collector.ts

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

### src/trace/trace-hooks.ts

[不存在]

### src/trace/trace-extension.ts

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

### src/extensions/budget.ts

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
        throw new BudgetExceededError(
          "tool_calls",
          limits.maxToolCalls,
        );
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

### src/logging/logger-hooks.ts

[不存在]

### src/logging/logger-extension.ts

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
      log(
        [
          `[model end]`,
          `call=${callId}`,
          `turn=${turnIndex}`,
          `stopReason=${message.stopReason}`,
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

## 9. Examples

### src/examples/tool-calling.ts

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

### src/examples/file-tool-loop.ts

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

### src/examples/non-streaming.ts

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

### src/examples/streaming.ts

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

## 10. Tests

### tests/agent-loop.test.ts

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
});
````

### tests/agent.test.ts

````typescript
import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AssistantMessage,
} from "../src/ai/types.js";

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
});
````

### tests/event-stream.test.ts

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

### tests/openai-compatible.test.ts

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

});
````

### tests/read-file.test.ts

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
});
````

### tests/fakes/list-directory.test.ts

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
});
````

### tests/fakes/fakes-stream.ts

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

### tests/extension-host.test.ts

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

### tests/budget.test.ts

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
    },
  );
});
````

### tests/action-result.type-test.ts

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

### tests/run-status.type-test.ts

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

## 11. Reliability Prototype

### src/core/action-result.ts

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

### src/core/run-status.ts

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

## 12. Environment

- .env：存在
- 变量名：
  - AGENT_API_KEY
  - AGENT_BASE_URL
  - AGENT_MODEL
- pnpm-lock.yaml：存在
- lockfileVersion：'9.0'
