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


/**
 * 推理模型的思考过程（DeepSeek 的 reasoning_content）。
 * 开启 thinking 且带工具时，之后的每次请求都必须原样回传，否则 400。
 */
export type ThinkingContent = {
  type: "thinking";
  thinking: string;
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

  /** output 里属于思考过程的部分（开启 thinking 且 Provider 返回了才有） */
  reasoning?: number;
};


export type AssistantMessage = {
  role: "assistant";
  content: Array<ThinkingContent | TextContent | ToolCall>;

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
