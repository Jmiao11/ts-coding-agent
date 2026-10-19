import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AgentEvent,
} from "../src/agent/types.js";

import type {
  AssistantMessage,
} from "../src/ai/types.js";

import {
  streamAnswers,
} from "../src/ui/answer-stream.js";


function assistant(content: AssistantMessage["content"]): AssistantMessage {
  return {
    role: "assistant",
    content,
    provider: "fake",
    model: "fake",
    stopReason: "stop",
    timestamp: 1,
  };
}


function delta(text: string): AgentEvent {
  const partial = assistant([]);

  return {
    type: "message_update",
    message: partial,
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: text, partial },
  };
}


function end(message: AssistantMessage): AgentEvent {
  return { type: "message_end", message };
}


function recordingView() {
  const calls: string[] = [];

  return {
    calls,
    view: {
      beginAnswer: () => calls.push("begin"),
      appendAnswer: (text: string) => calls.push(`+${text}`),
      endAnswer: () => calls.push("end"),
    },
  };
}


describe("streamAnswers", () => {
  it("opens on the first text delta, appends each delta, and closes without repeating the answer", () => {
    const { calls, view } = recordingView();
    const onEvent = streamAnswers(view);

    onEvent(delta("你"));
    onEvent(delta("好"));
    onEvent(end(assistant([{ type: "text", text: "你好" }])));

    expect(calls).toEqual(["begin", "+你", "+好", "end"]);
  });

  it("shows nothing for a tool-only message, and one answer per message", () => {
    const { calls, view } = recordingView();
    const onEvent = streamAnswers(view);

    onEvent(end(assistant([{ type: "toolCall", id: "1", name: "read_file", arguments: {} }])));
    onEvent(delta("看完了"));
    onEvent(end(assistant([{ type: "text", text: "看完了" }])));

    expect(calls).toEqual(["begin", "+看完了", "end"]);
  });

  it("shows the text once when the provider did not stream it", () => {
    const { calls, view } = recordingView();

    streamAnswers(view)(end(assistant([{ type: "text", text: "完整回答" }])));

    expect(calls).toEqual(["begin", "+完整回答", "end"]);
  });
});
