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

export type BeforeToolCallResult = {
  block: true;
  reason: string;
};

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
  ): MaybePromise<BeforeToolCallResult | void>;

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