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
  it("merges extraBody into the request without overriding standard fields", async () => {
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(body, { status: 200 }));

    const streamFn = createOpenAICompatibleStreamFn({
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
      extraBody: {
        thinking: { type: "disabled" },
        model: "should-not-win",
        stream: false,
      },
    });

    const stream = await streamFn(model, context, undefined);

    for await (const _event of stream) {
      // 读完整个流
    }

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;

    expect(requestBody.thinking).toEqual({ type: "disabled" });
    expect(requestBody.model).toBe("fake-model");
    expect(requestBody.stream).toBe(true);
  });

  it("reports length when the output is cut off, and sends max_tokens", async () => {
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const data of [
          '{"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}',
          "[DONE]",
        ]) {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        controller.close();
      },
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(body, { status: 200 }));

    const streamFn = createOpenAICompatibleStreamFn({
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
    });

    const stream = await streamFn(model, context, { maxTokens: 50 });

    let done: AssistantMessage | undefined;
    let reason: string | undefined;

    for await (const event of stream) {
      if (event.type === "done") {
        done = event.message;
        reason = event.reason;
      }
    }

    // 以前会报 stop：截断的输出被当成完整的
    expect(reason).toBe("length");
    expect(done?.stopReason).toBe("length");

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as { max_tokens?: number };

    expect(requestBody.max_tokens).toBe(50);
  });

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

  it("reads token usage from the final usage chunk", async () => {
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const data of [
          '{"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}',
          '{"choices":[],"usage":{"prompt_tokens":1200,"completion_tokens":30,"prompt_tokens_details":{"cached_tokens":1000}}}',
          "[DONE]",
        ]) {
          controller.enqueue(
            encoder.encode(`data: ${data}\n\n`),
          );
        }

        controller.close();
      },
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(body, { status: 200 }));

    const streamFn = createOpenAICompatibleStreamFn({
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
    });

    const stream = await streamFn(model, context, undefined);

    let done: AssistantMessage | undefined;

    for await (const event of stream) {
      if (event.type === "done") {
        done = event.message;
      }
    }

    expect(done?.usage).toEqual({
      input: 1200,
      output: 30,
      cacheRead: 1000,
    });

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as { stream_options?: unknown };

    expect(requestBody.stream_options).toEqual({
      include_usage: true,
    });
  });

});
