import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  AssistantMessage,
} from "../src/ai/types.js";

import {
  createOpenAICompatibleStreamFn,
} from "../src/ai/providers/openai-compatible.js";

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

  it("sends the system prompt first without adding it to the transcript", async () => {
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(body, { status: 200 }));

    try {
      const agent = new Agent({
        initialState: {
          model: {
            id: "fake-model",
            provider: "openai-compatible",
            name: "Fake Model",
            contextWindow: 1000,
            maxTokens: 100,
          },
          systemPrompt: "You are a test agent.",
        },

        loopConfig: {
          convertToLlm(messages) {
            return [...messages];
          },
        },

        streamFn: createOpenAICompatibleStreamFn({
          apiKey: "test-key",
          baseUrl: "https://example.com/v1",
        }),
      });

      await agent.prompt("hello");

      const requestBody = JSON.parse(
        String(fetchMock.mock.calls[0]?.[1]?.body),
      ) as {
        messages: Array<{ role: string; content: string }>;
      };

      expect(requestBody.messages[0]).toEqual({
        role: "system",
        content: "You are a test agent.",
      });

      expect(requestBody.messages[1]?.role).toBe("user");

      // system prompt 不属于 transcript
      expect(
        agent.state.messages.map((message) => message.role),
      ).toEqual(["user", "assistant"]);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
