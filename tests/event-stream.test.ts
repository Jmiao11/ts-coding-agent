import {
  describe,
  expect,
  it,
} from "vitest";

import Type from "typebox";

import type {
  AssistantMessage,
  AssistantMessageEvent,
} from "../src/ai/types.js";

import {
  createAssistantMessageEventStream,
} from "../src/ai/event-stream.js";


describe("AssistantMessageEventStream", () => {
  it("streams assistant events in order", async () => {
    const message: AssistantMessage = {
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

      timestamp: 1,
    };


    const stream =
      createAssistantMessageEventStream();


    const events:
      AssistantMessageEvent[] = [];


    const consumer = (async () => {
      for await (const event of stream) {
        events.push(event);
      }
    })();


    stream.push({
      type: "start",
      partial: message,
    });


    stream.push({
      type: "text_delta",
      contentIndex: 0,
      delta: "hi",
      partial: message,
    });


    stream.push({
      type: "done",
      reason: "stop",
      message,
    });


    stream.end();


    await consumer;


    expect(
      events.map((event) => event.type),
    ).toEqual([
      "start",
      "text_delta",
      "done",
    ]);
  });
});