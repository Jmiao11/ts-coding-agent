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
} from "../src/agent/types.js";

import {
  createSessionWriter,
  loadSession,
  newSessionFile,
} from "../src/session/session-store.js";


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
      loaded.entries.map((entry) => entry.message),
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
