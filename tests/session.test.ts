import {
  appendFile,
  mkdtemp,
  rm,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  afterEach,
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
  type CompactionEvent,
} from "../src/context/compaction.js";

import {
  createSessionWriter,
  loadSession,
  newSessionFile,
  rebuildSession,
} from "../src/session/session-store.js";

import {
  sanitizeForLlm,
} from "../src/session/sanitize-for-llm.js";


let root: string | undefined;


afterEach(async () => {
  if (root) {
    await rm(root, {
      recursive: true,
      force: true,
    });

    root = undefined;
  }
});


async function createSession() {
  root = await mkdtemp(
    join(tmpdir(), "agent-session-"),
  );

  return newSessionFile(
    root,
    join(root, "sessions"),
  );
}


describe("session store", () => {
  it("writes one linked entry per line and loads messages back unchanged", async () => {
    const { path, header } = await createSession();

    const messages: AgentMessage[] = [
      {
        role: "user",
        content: "task",
        timestamp: 1,
      },
      {
        role: "assistant",
        content: [{
          type: "toolCall",
          id: "call-1",
          name: "read_file",
          arguments: { path: "a.ts" },
        }],
        provider: "fake",
        model: "fake",
        stopReason: "toolUse",
        usage: { input: 10, output: 2 },
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read_file",
        content: [{
          type: "text",
          text: 'line1\r\nline2 "quoted" 中文\n',
        }],
        isError: false,
        timestamp: 3,
      },
    ];

    const writer = createSessionWriter({ path, header });

    const ids = messages.map(
      (message) => writer.appendMessage(message),
    );

    const loaded = loadSession(path);

    expect(loaded.header).toEqual(header);

    expect(
      rebuildSession(loaded.entries).messages,
    ).toEqual(messages);

    expect(
      loaded.entries.map((entry) => entry.parentId),
    ).toEqual([
      null,
      ids[0],
      ids[1],
    ]);
  });


  it("skips a half-written last line and keeps later appends valid", async () => {
    const { path, header } = await createSession();

    createSessionWriter({ path, header })
      .appendMessage({
        role: "user",
        content: "first",
        timestamp: 1,
      });

    await appendFile(
      path,
      '{"type":"message","id":"brok',
    );

    const loaded = loadSession(path);

    expect(loaded.entries).toHaveLength(1);

    const nextId = createSessionWriter({
      path,
      header: loaded.header,
      entries: loaded.entries,
    }).appendMessage({
      role: "user",
      content: "next",
      timestamp: 2,
    });

    const reloaded = loadSession(path);

    expect(
      reloaded.entries.map((entry) => entry.id),
    ).toEqual([
      loaded.entries[0]?.id,
      nextId,
    ]);

    expect(reloaded.entries[1]?.parentId)
      .toBe(loaded.entries[0]?.id);
  });
});


// ---------- S2：压缩状态的持久化 ----------

const fakeModel = {
  id: "fake",
  provider: "fake",
  name: "Fake",
  contextWindow: 1000,
  maxTokens: 100,
};

const compactionSettings = {
  contextWindow: 1000,
  reserveTokens: 200,
  keepRecentTokens: 300,
};


function countingSummarizer() {
  let calls = 0;

  const streamFn: StreamFn = () => {
    calls += 1;

    const message: AssistantMessage = {
      role: "assistant",
      content: [{
        type: "text",
        text: `SUMMARY-${calls}`,
      }],
      provider: "fake",
      model: "fake",
      stopReason: "stop",
      timestamp: 1,
    };

    const stream = createAssistantMessageEventStream();
    stream.push({ type: "start", partial: message });
    stream.push({ type: "done", reason: "stop", message });
    stream.end();

    return stream;
  };

  return { streamFn, calls: () => calls };
}


function callRead(
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


function readResult(path: string): AgentMessage {
  return {
    role: "toolResult",
    toolCallId: `call-${path}`,
    toolName: "read_file",
    content: [{
      type: "text",
      text: "x".repeat(400),
    }],
    isError: false,
    timestamp: 1,
  };
}


function withoutTimestamps(
  messages: AgentMessage[],
): AgentMessage[] {
  return messages.map(
    (message) => ({ ...message, timestamp: 0 }),
  );
}


describe("session + compaction", () => {
  it("restores the same compacted view from the file, including which usage is stale", async () => {
    const { path, header } = await createSession();
    const writer = createSessionWriter({ path, header });
    const summarizer = countingSummarizer();
    const events: CompactionEvent[] = [];

    const compactor = createCompactor({
      model: fakeModel,
      streamFn: summarizer.streamFn,
      settings: compactionSettings,
      onCompaction: (event) => {
        events.push(event);

        writer.appendCompaction(event.checkpoint, {
          tokensBefore: event.tokensBefore,
        });
      },
    });

    const messages: AgentMessage[] = [];

    const push = (message: AgentMessage): void => {
      messages.push(message);
      writer.appendMessage(message);
    };

    push({
      role: "user",
      content: "任务：只读",
      timestamp: 1,
    });

    for (let index = 0; index < 8; index += 1) {
      push(
        callRead(`f${index}.ts`, {
          input: 100 + index * 110,
          output: 10,
        }),
      );

      push(readResult(`f${index}.ts`));
    }

    await compactor.transformContext(messages);
    expect(events).toHaveLength(1);

    // 压缩后新增消息，但没有新的可信 usage。
    for (const name of ["g0.ts", "g1.ts"]) {
      push(callRead(name));
      push(readResult(name));
    }

    const liveView =
      await compactor.transformContext(messages);

    expect(summarizer.calls()).toBe(1);

    // 从磁盘加载，重新建立完整 transcript 和 checkpoint。
    const rebuilt =
      rebuildSession(loadSession(path).entries);

    expect(rebuilt.messages).toEqual(messages);
    expect(rebuilt.checkpoint).toEqual(events[0]?.checkpoint);

    const restoredSummarizer = countingSummarizer();

    const restored = createCompactor({
      model: fakeModel,
      streamFn: restoredSummarizer.streamFn,
      settings: compactionSettings,
      initialCheckpoint: rebuilt.checkpoint,
    });

    const restoredView =
      await restored.transformContext(rebuilt.messages);

    expect(withoutTimestamps(restoredView)).toEqual(
      withoutTimestamps(liveView),
    );

    expect(restoredSummarizer.calls()).toBe(0);
  });
});


describe("sanitizeForLlm", () => {
  it("drops failed assistant turns and closes tool calls that never got a result", () => {
    const history: AgentMessage[] = [
      { role: "user", content: "task", timestamp: 1 },
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-1",
            name: "read_file",
            arguments: { path: "a.ts" },
          },
          {
            type: "toolCall",
            id: "call-2",
            name: "run_command",
            arguments: { command: "ping" },
          },
        ],
        provider: "fake",
        model: "fake",
        stopReason: "toolUse",
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read_file",
        content: [{ type: "text", text: "ok" }],
        isError: false,
        timestamp: 3,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "partial" }],
        provider: "fake",
        model: "fake",
        stopReason: "aborted",
        errorMessage: "This operation was aborted",
        timestamp: 4,
      },
      { role: "user", content: "继续", timestamp: 5 },
    ];

    const sanitized = sanitizeForLlm(history);

    expect(
      sanitized.map((message) =>
        message.role === "toolResult"
          ? `toolResult:${message.toolCallId}`
          : message.role,
      ),
    ).toEqual([
      "user",
      "assistant",
      "toolResult:call-1",
      "toolResult:call-2",
      "user",
    ]);

    expect(sanitized[3]).toMatchObject({
      toolCallId: "call-2",
      toolName: "run_command",
      isError: true,
    });

    expect(sanitizeForLlm(sanitized)).toEqual(sanitized);
  });
});
