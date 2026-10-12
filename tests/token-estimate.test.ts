import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AssistantMessage,
  ToolResultMessage,
} from "../src/ai/types.js";

import {
  estimateContextTokens,
  estimateMessageTokens,
  estimateTextTokens,
} from "../src/context/token-estimate.js";


function assistant(
  input: number,
  output: number,
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "ok" }],
    provider: "fake",
    model: "fake",
    stopReason,
    usage: { input, output },
    timestamp: 1,
  };
}


function toolResult(text: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read_file",
    content: [{ type: "text", text }],
    isError: false,
    timestamp: 1,
  };
}


describe("estimateTextTokens", () => {
  it("counts ASCII by /3 and non-ASCII 1:1", () => {
    expect(estimateTextTokens("abcdefgh")).toBe(3);
    expect(estimateTextTokens("你好世界")).toBe(4);
    expect(estimateTextTokens("abcd你好")).toBe(4);
  });
});


describe("estimateContextTokens", () => {
  it("uses the last trusted usage plus trailing estimates", () => {
    const messages = [
      assistant(1000, 50),
      toolResult("x".repeat(400)),
      assistant(2000, 80),
      toolResult("y".repeat(40)),
      assistant(9999, 1, "error"),
    ];

    // 最后一条可信的是 index 2：2000 + 80，之后 toolResult ≈ 14，错误消息 ≈ 1
    expect(estimateContextTokens(messages)).toEqual({
      tokens: 2080 + 14 + 1,
      usageTokens: 2080,
      trailingTokens: 15,
    });

    expect(
      estimateContextTokens(messages, 3).usageTokens,
    ).toBe(0);
  });

  describe("estimateMessageTokens", () => {
  it("counts thinking blocks, which are sent back to the model", () => {
    const message: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "x".repeat(300) },
        { type: "text", text: "ok" },
      ],
      provider: "fake",
      model: "fake",
      stopReason: "stop",
      timestamp: 1,
    };

    // 300 个 ASCII 按 /3 是 100，"ok" 是 1
    expect(estimateMessageTokens(message)).toBe(101);
  });

});
});
