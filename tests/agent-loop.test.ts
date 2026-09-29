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

  it("returns an error ToolResult when tool budget is exceeded and continues", async () => {
    const prompt: UserMessage = {
      role: "user",
      content: "Echo twice.",
      timestamp: 1,
    };

    const toolCallMessage: AssistantMessage = {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-1",
          name: "echo",
          arguments: { text: "first" },
        },
        {
          type: "toolCall",
          id: "call-2",
          name: "echo",
          arguments: { text: "second" },
        },
      ],
      provider: "fake",
      model: "fake-model",
      stopReason: "toolUse",
      timestamp: 2,
    };

    const finalMessage: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      provider: "fake",
      model: "fake-model",
      stopReason: "stop",
      timestamp: 3,
    };

    const modelCalls: Message[][] = [];

    const streamFn: StreamFn = (_model, context) => {
      modelCalls.push([...context.messages]);

      const message =
        modelCalls.length === 1
          ? toolCallMessage
          : finalMessage;

      const stream = createAssistantMessageEventStream();
      stream.push({ type: "start", partial: message });
      stream.push({
        type: "done",
        reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
        message,
      });
      stream.end();
      return stream;
    };

    let executeCount = 0;
    const parameters = Type.Object({ text: Type.String() });

    const echoTool: AgentTool<
      typeof parameters,
      Record<string, never>
    > = {
      name: "echo",
      label: "Echo",
      description: "Echo text.",
      parameters,
      async execute(_toolCallId, args) {
        executeCount += 1;
        return {
          content: [{ type: "text", text: args.text }],
          details: {},
        };
      },
    };

    const budget = createBudgetExtension({
      maxToolCalls: 1,
    });

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
      extensions: [budget],
    };

    const newMessages = await runAgentLoop(
      [prompt],
      { messages: [], tools: [echoTool] },
      config,
      undefined,
      streamFn,
      () => {},
    );

    expect(executeCount).toBe(1);
    expect(budget.getState()).toEqual({
      modelCalls: 2,
      toolCalls: 1,
    });

    expect(
      newMessages.filter(
        (message) => message.role === "toolResult",
      ),
    ).toMatchObject([
      {
        toolCallId: "call-1",
        isError: false,
        content: [{ type: "text", text: "first" }],
      },
      {
        toolCallId: "call-2",
        isError: true,
        content: [{
          type: "text",
          text: "Budget exceeded: tool_calls limit is 1.",
        }],
      },
    ]);

    expect(modelCalls).toHaveLength(2);
    expect(newMessages.at(-1)).toEqual(finalMessage);
  });

  it("returns an error ToolResult when the model calls a missing tool and continues", async () => {
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
          id: "call-missing",
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
          text: "抱歉，我暂时无法查询时间。",
        },
      ],
      provider: "fakes",
      model: "fakes-model",
      stopReason: "stop",
      timestamp: 3,
    };

    const modelCalls: Message[][] = [];

    const streamFn: StreamFn = (_model, context) => {
      modelCalls.push([...context.messages]);

      const message =
        modelCalls.length === 1
          ? toolCallMessage
          : finalMessage;

      const stream = createAssistantMessageEventStream();
      stream.push({ type: "start", partial: message });
      stream.push({
        type: "done",
        reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
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

    /*
     * context.tools 是空的，
     * 所以模型调用的 get_time 并不存在。
     */
    const context: AgentContext = {
      messages: [],
      tools: [],
    };

    const newMessages = await runAgentLoop(
      [prompt],
      context,
      config,
      undefined,
      streamFn,
      () => {},
    );

    /*
     * 1. 第一次模型调用返回 ToolCall，
     *    第二次模型调用看到错误 ToolResult 后给出最终回答。
     */
    expect(modelCalls).toHaveLength(2);

    expect(
      modelCalls[1]?.map((message) => message.role),
    ).toEqual([
      "user",
      "assistant",
      "toolResult",
    ]);

    /*
     * 2. 不存在的 Tool 要产生 isError 为 true 的 ToolResult，
     *    内容里包含 "Tool not found"。
     */
    const toolResult = newMessages.find(
      (message) => message.role === "toolResult",
    );

    expect(toolResult).toMatchObject({
      role: "toolResult",
      toolCallId: "call-missing",
      toolName: "get_time",
      isError: true,
    });

    expect(toolResult?.content).toMatchObject([
      {
        type: "text",
        text: "Tool not found: get_time",
      },
    ]);

    /*
     * 3. Agent Loop 没有中断，最终拿到了模型的回答。
     */
    expect(newMessages.at(-1)).toEqual(finalMessage);
  });
});
