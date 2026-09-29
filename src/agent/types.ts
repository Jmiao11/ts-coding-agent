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
