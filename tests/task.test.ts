import {
  describe,
  expect,
  it,
} from "vitest";

import Type from "typebox";

import {
  createAssistantMessageEventStream,
} from "../src/ai/event-stream.js";

import type {
  AssistantMessage,
  Context,
  SimpleStreamOptions,
} from "../src/ai/types.js";

import type {
  AgentTool,
  StreamFn,
} from "../src/agent/types.js";

import {
  createBudgetExtension,
} from "../src/extensions/budget.js";

import {
  createTaskTool,
} from "../src/tools/task.js";


const model = {
  id: "fake-model",
  provider: "fake",
  name: "Fake Model",
  contextWindow: 1000,
  maxTokens: 100,
};


function assistant(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
  usage: { input: number; output: number },
): AssistantMessage {
  return {
    role: "assistant",
    content,
    provider: "fake",
    model: "fake-model",
    stopReason,
    usage,
    timestamp: 1,
  };
}


/** 按顺序返回预设回复，并记录每次请求。 */
function scriptedStreamFn(replies: AssistantMessage[]) {
  const requests: Array<{
    context: Context;
    options: SimpleStreamOptions | undefined;
  }> = [];

  const streamFn: StreamFn = (_model, context, options) => {
    requests.push({ context, options });

    const message = replies[requests.length - 1];

    if (!message) {
      throw new Error("No more scripted replies.");
    }

    const stream = createAssistantMessageEventStream();

    stream.push({ type: "start", partial: message });

    if (
      message.stopReason === "error"
      || message.stopReason === "aborted"
    ) {
      stream.push({
        type: "error",
        reason: message.stopReason,
        error: message,
      });
    } else {
      stream.push({
        type: "done",
        reason:
          message.stopReason === "toolUse"
            ? "toolUse"
            : "stop",
        message,
      });
    }

    stream.end();

    return stream;
  };

  return { streamFn, requests };
}


describe("task tool", () => {
  it("runs a sub-agent in a fresh context with only the given tools and returns its final report", async () => {
    const { streamFn, requests } = scriptedStreamFn([
      assistant(
        [{
          type: "toolCall",
          id: "sub-1",
          name: "read_file",
          arguments: { path: "a.ts" },
        }],
        "toolUse",
        { input: 100, output: 10 },
      ),

      assistant(
        [{
          type: "text",
          text: "a.ts 导出了 add 函数。",
        }],
        "stop",
        { input: 150, output: 20 },
      ),
    ]);

    const parameters = Type.Object({
      path: Type.String(),
    });

    const readFile: AgentTool<
      typeof parameters,
      Record<string, never>
    > = {
      name: "read_file",
      label: "Read File",
      description: "Read a file.",
      parameters,

      async execute(_toolCallId, args) {
        return {
          content: [{
            type: "text",
            text: `export function add() {} // ${args.path}`,
          }],
          details: {},
        };
      },
    };

    const task = createTaskTool({
      model,
      streamFn,
      systemPrompt: "You are a sub-agent.",
      tools: [readFile],
    });

    const result = await task.execute("call-1", {
      description: "看 a.ts",
      prompt: "a.ts 导出了什么？",
    });

    expect(result.isError).toBeFalsy();

    expect(result.content).toEqual([
      {
        type: "text",
        text: "a.ts 导出了 add 函数。",
      },
    ]);

    expect(result.details).toEqual({
      description: "看 a.ts",
      modelCalls: 2,
      toolCalls: 1,
      usage: { input: 250, output: 30 },
    });

    expect(
      requests[0]?.context.systemPrompt,
    ).toBe("You are a sub-agent.");

    expect(
      requests[0]?.context.messages,
    ).toEqual([
      expect.objectContaining({
        role: "user",
        content: "a.ts 导出了什么？",
      }),
    ]);

    expect(
      requests[0]?.options?.tools?.map(
        (tool) => tool.name,
      ),
    ).toEqual(["read_file"]);
  });


  it("reports a failed or empty sub-agent run as an error, not as an empty success", async () => {
    const failing = scriptedStreamFn([
      {
        ...assistant([], "error", { input: 0, output: 0 }),
        errorMessage: "Provider HTTP 502: bad gateway",
      },
    ]);

    const broken = await createTaskTool({
      model,
      streamFn: failing.streamFn,
      systemPrompt: "You are a sub-agent.",
      tools: [],
    }).execute("call-1", {
      description: "x",
      prompt: "y",
    });

    expect(broken.isError).toBe(true);

    expect(broken.content[0]?.text).toBe(
      "Task not completed: the sub-agent's model call failed: Provider HTTP 502: bad gateway",
    );

    const silent = scriptedStreamFn([
      assistant([], "stop", { input: 10, output: 0 }),
    ]);

    const empty = await createTaskTool({
      model,
      streamFn: silent.streamFn,
      systemPrompt: "You are a sub-agent.",
      tools: [],
    }).execute("call-2", {
      description: "x",
      prompt: "y",
    });

    expect(empty.isError).toBe(true);

    expect(empty.content[0]?.text).toBe(
      "Task not completed: the sub-agent finished without writing a report.",
    );
  });


  it("says the run was interrupted when the sub-agent is aborted", async () => {
    const { streamFn } = scriptedStreamFn([
      assistant([], "aborted", { input: 0, output: 0 }),
    ]);

    const result = await createTaskTool({
      model,
      streamFn,
      systemPrompt: "You are a sub-agent.",
      tools: [],
    }).execute("call-1", {
      description: "x",
      prompt: "y",
    });

    expect(result.isError).toBe(true);

    expect(result.content[0]?.text).toBe(
      "Task not completed: the user interrupted the run before the sub-agent finished.",
    );
  });


  it("turns the sub-agent's own budget running out into an error result with what it did so far", async () => {
    const { streamFn } = scriptedStreamFn([
      assistant(
        [{
          type: "toolCall",
          id: "sub-1",
          name: "noop",
          arguments: {},
        }],
        "toolUse",
        { input: 100, output: 10 },
      ),
    ]);

    const parameters = Type.Object({});

    const noop: AgentTool<
      typeof parameters,
      Record<string, never>
    > = {
      name: "noop",
      label: "Noop",
      description: "Does nothing.",
      parameters,

      async execute() {
        return {
          content: [{ type: "text", text: "ok" }],
          details: {},
        };
      },
    };

    const task = createTaskTool({
      model,
      streamFn,
      systemPrompt: "You are a sub-agent.",
      tools: [noop],

      createExtensions: () => [
        createBudgetExtension({ maxModelCalls: 1 }),
      ],
    });

    const result = await task.execute("call-1", {
      description: "x",
      prompt: "y",
    });

    expect(result.isError).toBe(true);

    expect(result.content[0]?.text).toBe(
      "Task not completed: the sub-agent used up its own budget (Budget exceeded: model_calls limit is 1.). This was the sub-agent's budget, not yours; you can continue, for example with a narrower task.",
    );

    expect(result.details).toEqual({
      description: "x",
      modelCalls: 1,
      toolCalls: 1,
      usage: { input: 100, output: 10 },
    });
  });

  it("stops the sub-agent when the run is aborted while one of its tools is running", async () => {
    const controller = new AbortController();

    // 第二条回复用于发现中止信号没有传入子循环的情况。
    const { streamFn, requests } = scriptedStreamFn([
      assistant(
        [
          { type: "toolCall", id: "sub-1", name: "slow", arguments: {} },
          { type: "toolCall", id: "sub-2", name: "slow", arguments: {} },
        ],
        "toolUse",
        { input: 100, output: 10 },
      ),
      assistant(
        [{ type: "text", text: "不应该走到这里" }],
        "stop",
        { input: 200, output: 20 },
      ),
    ]);

    let executed = 0;
    const parameters = Type.Object({});
    const slow: AgentTool<typeof parameters, Record<string, never>> = {
      name: "slow",
      label: "Slow",
      description: "Pretends to take a while; the user presses Ctrl+C meanwhile.",
      parameters,
      async execute() {
        executed += 1;
        controller.abort();
        return { content: [{ type: "text", text: "ok" }], details: {} };
      },
    };

    const result = await createTaskTool({
      model,
      streamFn,
      systemPrompt: "You are a sub-agent.",
      tools: [slow],
    }).execute("call-1", { description: "x", prompt: "y" }, controller.signal);

    expect(executed).toBe(1);
    expect(requests).toHaveLength(1);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      "Task not completed: the user interrupted the run before the sub-agent finished.",
    );
  });
});
