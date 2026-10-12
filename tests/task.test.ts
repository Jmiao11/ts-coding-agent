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
});