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
  it("counts ASCII by /4 and non-ASCII 1:1", () => {
    expect(estimateTextTokens("abcdefgh")).toBe(2);
    expect(estimateTextTokens("你好世界")).toBe(4);
    expect(estimateTextTokens("abcd你好")).toBe(3);
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

    expect(estimateContextTokens(messages)).toEqual({
      tokens: 2080 + 10 + 1,
      usageTokens: 2080,
      trailingTokens: 11,
    });

    expect(
      estimateContextTokens(messages, 3).usageTokens,
    ).toBe(0);
  });
});