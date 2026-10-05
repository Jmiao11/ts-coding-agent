import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AgentMessage,
  StreamFn,
} from "../src/agent/types.js";

import type {
  AssistantMessage,
} from "../src/ai/types.js";

import {
  createAssistantMessageEventStream,
} from "../src/ai/event-stream.js";

import {
  createCompactor,
  findCutPoint,
  serializeConversation,
  type CompactionEvent,
} from "../src/context/compaction.js";


// ---------- 消息构造 ----------

function user(text: string): AgentMessage {
  return {
    role: "user",
    content: text,
    timestamp: 1,
  };
}


function callTool(
  path: string,
  usage?: { input: number; output: number },
): AgentMessage {
  return {
    role: "assistant",
    content: [{
      type: "toolCall",
      id: `call-${path}`,
      name: "read_file",
      arguments: { path },
    }],
    provider: "fake",
    model: "fake",
    stopReason: "toolUse",
    ...(usage ? { usage } : {}),
    timestamp: 1,
  };
}


function editTool(path: string): AgentMessage {
  return {
    role: "assistant",
    content: [{
      type: "toolCall",
      id: `edit-${path}`,
      name: "edit_file",
      arguments: { path, oldText: "a", newText: "b" },
    }],
    provider: "fake",
    model: "fake",
    stopReason: "toolUse",
    timestamp: 1,
  };
}


function result(
  text: string,
  isError = false,
  toolCallId = "call-1",
): AgentMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName: "read_file",
    content: [{ type: "text", text }],
    isError,
    timestamp: 1,
  };
}


function say(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    provider: "fake",
    model: "fake",
    stopReason: "stop",
    timestamp: 1,
  };
}


// ---------- C2 ----------

describe("findCutPoint", () => {
  const messages = [
    user("task"),               // 0
    callTool("a"),              // 1
    result("x".repeat(400)),    // 2
    callTool("b"),              // 3
    result("x".repeat(400)),    // 4
    callTool("c"),              // 5
    result("x".repeat(400)),    // 6
    say("done"),                // 7
  ];

  it("never cuts at a tool result and pins the turn's user message", () => {
    const cut = findCutPoint(messages, 0, 150);

    expect(cut).toEqual({
      firstKeptIndex: 5,
      turnStartIndex: 0,
    });

    expect(messages[cut.firstKeptIndex]?.role).not.toBe("toolResult");
  });


  it("reports nothing to compact when everything fits", () => {
    expect(
      findCutPoint(messages, 0, 1_000_000).firstKeptIndex,
    ).toBe(0);
  });
});


describe("serializeConversation", () => {
  it("serializes roles as text and truncates long blocks", () => {
    const text = serializeConversation([
      user("修一下测试"),
      callTool("a.ts"),
      result("y".repeat(2500)),
      result("boom", true),
    ]);

    expect(text).toContain("[User]: 修一下测试");
    expect(text).toContain(
      '[Assistant tool calls]: read_file({"path":"a.ts"})',
    );
    expect(text).toContain("[... 500 more characters truncated]");
    expect(text).not.toContain("y".repeat(2001));
    expect(text).toContain("[Tool error] read_file: boom");
  });
});


// ---------- C3 ----------

const fakeModel = {
  id: "fake",
  provider: "fake",
  name: "Fake",
  contextWindow: 1000,
  maxTokens: 100,
};


/**
 * 每次返回 SUMMARY-1、SUMMARY-2……
 * 同时记录总结请求和工具定义。
 */
function fakeSummarizer(
  stopReasons: Array<"stop" | "length"> = [],
) {
  const prompts: string[] = [];
  const toolsSeen: unknown[] = [];
  const maxTokensSeen: unknown[] = [];

  const streamFn: StreamFn = (_model, context, options) => {
    toolsSeen.push(options?.tools);
    maxTokensSeen.push(options?.maxTokens);

    const request = context.messages.find(
      (message) => message.role === "user",
    );

    prompts.push(
      request?.role === "user" && typeof request.content === "string"
        ? request.content
        : "",
    );

    const stopReason = stopReasons[prompts.length - 1] ?? "stop";

    const message: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: `SUMMARY-${prompts.length}` }],
      provider: "fake",
      model: "fake",
      stopReason,
      timestamp: 1,
    };

    const stream = createAssistantMessageEventStream();
    stream.push({ type: "start", partial: message });
    stream.push({ type: "done", reason: stopReason, message });
    stream.end();

    return stream;
  };

  return { streamFn, prompts, toolsSeen, maxTokensSeen };
}


function summaryText(message: AgentMessage | undefined): string {
  return message?.role === "user" && typeof message.content === "string"
    ? message.content
    : "";
}


describe("createCompactor", () => {
  // 超过 1000 - 200 = 800 才压缩，近期原文保留约 300 tokens。
  const settings = {
    contextWindow: 1000,
    reserveTokens: 200,
    keepRecentTokens: 300,
  };


  it("leaves the context untouched below the threshold", async () => {
    const { streamFn, prompts } = fakeSummarizer();

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
    });

    const messages = [
      user("task"),
      callTool("a.ts", { input: 300, output: 10 }),
      result("x".repeat(400), false, "call-a.ts"),
    ];

    expect(await compactor.transformContext(messages)).toBe(messages);
    expect(prompts).toHaveLength(0);
  });


  it("records only files whose tool calls succeeded", async () => {
    const { streamFn } = fakeSummarizer();

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
    });

    const messages = [
      user("task"),                                           // 0
      editTool("broken.ts"),                                  // 1
      result("oldText not found", true, "edit-broken.ts"),     // 2
      editTool("fixed.ts"),                                   // 3
      result("Edited fixed.ts at line 1.", false, "edit-fixed.ts"), // 4
      callTool("big.ts", { input: 900, output: 10 }),         // 5
      result("x".repeat(1200), false, "call-big.ts"),          // 6
    ];

    const view = await compactor.transformContext(messages);
    const summary = summaryText(view[1]);

    expect(summary).toContain(
      "<modified-files>\nfixed.ts\n</modified-files>",
    );
    expect(summary).not.toContain("broken.ts");
  });


  it("compacts once, pins the task, ignores stale usage, and updates the summary later", async () => {
    const { streamFn, prompts, toolsSeen } = fakeSummarizer();
    const events: CompactionEvent[] = [];

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
      onCompaction: (event) => {
        events.push(event);
      },
    });

    const messages: AgentMessage[] = [
      user("任务：只读，不要修改文件"),
    ];

    for (let index = 0; index < 8; index += 1) {
      messages.push(
        callTool(`f${index}.ts`, {
          input: 100 + index * 110,
          output: 10,
        }),
      );

      messages.push(
        result("x".repeat(400), false, `call-f${index}.ts`),
      );
    }

    // 第一次压缩：保留下标 13..16。
    const view = await compactor.transformContext(messages);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("<original-request>");
    expect(prompts[0]).toContain("under about 80 tokens");
    expect(prompts[0]).toContain('read_file({"path":"f0.ts"})');
    expect(prompts[0]).not.toContain('read_file({"path":"f6.ts"})');

    expect(view[0]).toBe(messages[0]);
    expect(summaryText(view[1])).toContain("SUMMARY-1");
    expect(summaryText(view[1])).toContain("f0.ts");
    expect(view.slice(2)).toEqual(messages.slice(13));

    // 追加两组没有 usage 的消息。
    // 正确估算仍低于阈值；误用旧 usage 则会再次压缩。
    for (const name of ["g0.ts", "g1.ts"]) {
      messages.push(callTool(name));
      messages.push(
        result("x".repeat(400), false, `call-${name}`),
      );
    }

    const stillView = await compactor.transformContext(messages);

    expect(prompts).toHaveLength(1);
    expect(stillView.slice(2)).toEqual(messages.slice(13));

    // 新调用带回可信 usage，再次超过阈值，更新总结。
    messages.push(
      callTool("f8.ts", { input: 950, output: 10 }),
    );
    messages.push(
      result("x".repeat(400), false, "call-f8.ts"),
    );

    const secondView = await compactor.transformContext(messages);

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("<previous-summary>");
    expect(prompts[1]).toContain("SUMMARY-1");
    expect(summaryText(secondView[1])).toContain("SUMMARY-2");
    expect(secondView.slice(2)).toEqual(messages.slice(19));
    expect(events).toHaveLength(2);

    expect(toolsSeen).toEqual([undefined, undefined]);
  });

  it("keeps an earlier task in the summary when a later compaction pins a new turn", async () => {
    const { streamFn, prompts } = fakeSummarizer();

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
    });

    const messages: AgentMessage[] = [
      user("任务一：只读，不要修改 src"),
    ];

    for (let index = 0; index < 8; index += 1) {
      messages.push(
        callTool(`f${index}.ts`, { input: 100 + index * 110, output: 10 }),
      );
      messages.push(
        result("x".repeat(400), false, `call-f${index}.ts`),
      );
    }

    // 第一次压缩：原样保留任务一（下标 0）。
    const firstView = await compactor.transformContext(messages);
    expect(firstView[0]).toBe(messages[0]);

    // 第二个任务从下标 17 开始。
    messages.push(user("任务二：总结一下"));
    messages.push(callTool("h0.ts"));
    messages.push(result("x".repeat(400), false, "call-h0.ts"));
    messages.push(callTool("h1.ts"));
    messages.push(result("x".repeat(400), false, "call-h1.ts"));
    messages.push(callTool("h2.ts", { input: 950, output: 10 }));
    messages.push(result("x".repeat(400), false, "call-h2.ts"));

    const secondView = await compactor.transformContext(messages);

    expect(prompts).toHaveLength(2);
    expect(secondView[0]).toBe(messages[17]);
    expect(secondView.slice(2)).toEqual(messages.slice(20));
    expect(prompts[1]).toContain("<original-request>\n任务二");
    expect(prompts[1]).toContain("[User]: 任务一：只读，不要修改 src");
  });

  it("compacts on demand below the threshold and passes custom instructions to the summarizer", async () => {
    const { streamFn, prompts } = fakeSummarizer();
    const events: CompactionEvent[] = [];

    // 短会话全部位于保留区内，没有可总结的部分。
    const short = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
    });

    expect(
      (await short.compact([user("hi"), say("hello")])).status,
    ).toBe("nothing");

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
      onCompaction: (event) => {
        events.push(event);
      },
    });

    // 低于自动压缩阈值，但近期保留区之外还有内容。
    const messages: AgentMessage[] = [
      user("task"),
      callTool("a.ts"),
      result("x".repeat(600), false, "call-a.ts"),
      callTool("b.ts"),
      result("x".repeat(600), false, "call-b.ts"),
      say("done"),
    ];

    expect(
      await compactor.transformContext(messages),
    ).toBe(messages);

    expect(prompts).toHaveLength(0);

    const outcome = await compactor.compact(messages, {
      customInstructions: "重点保留 a.ts 的结论",
    });

    expect(outcome.status).toBe("compacted");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("重点保留 a.ts 的结论");
    expect(events).toHaveLength(1);

    const view = await compactor.transformContext(messages);

    expect(view[0]).toBe(messages[0]);
    expect(summaryText(view[1])).toContain("SUMMARY-1");
    expect(view.slice(2)).toEqual(messages.slice(3));
  });

  // 有可总结的内容（1、2），且超过阈值
  function overflowing(): AgentMessage[] {
    return [
      user("task"),                                          // 0
      callTool("a.ts"),                                      // 1
      result("x".repeat(600), false, "call-a.ts"),           // 2
      callTool("b.ts", { input: 900, output: 10 }),          // 3
      result("x".repeat(1200), false, "call-b.ts"),          // 4
    ];
  }


  it("retries once with a shorter instruction when the summary is cut off", async () => {
    const { streamFn, prompts, maxTokensSeen } =
      fakeSummarizer(["length", "stop"]);

    const events: CompactionEvent[] = [];

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
      onCompaction: (event) => {
        events.push(event);
      },
    });

    const view = await compactor.transformContext(overflowing());

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("cut off at the output limit");
    expect(summaryText(view[1])).toContain("SUMMARY-2");

    // 硬上限 = 0.8 × reserve(200)
    expect(maxTokensSeen).toEqual([160, 160]);
    expect(events).toHaveLength(1);
    expect(events[0]?.attempts).toBe(2);
  });


  it("gives up after two cut-off summaries and keeps the context unchanged", async () => {
    const { streamFn, prompts } =
      fakeSummarizer(["length", "length"]);

    const errors: unknown[] = [];

    const compactor = createCompactor({
      model: fakeModel,
      streamFn,
      settings,
      onError: (error) => {
        errors.push(error);
      },
    });

    const messages = overflowing();
    const view = await compactor.transformContext(messages);

    expect(prompts).toHaveLength(2);
    expect(view).toBe(messages);
    expect(errors).toHaveLength(1);
  });
});
