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

  systemPrompt: string;

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

  systemPrompt?: string;

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

      systemPrompt:
        initialState.systemPrompt ?? "",

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
      ...(this.internalState.systemPrompt
        ? {
            systemPrompt:
              this.internalState.systemPrompt,
          }
        : {}),

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
