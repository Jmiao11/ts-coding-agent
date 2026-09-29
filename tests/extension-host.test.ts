import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createExtensionHost,
} from "../src/agent/extension-host.js";

import type {
  AgentExtension,
} from "../src/agent/extension.js";


describe("ExtensionHost", () => {
  it("short-circuits before hooks in registration order", async () => {
    const calls: string[] = [];

    const extensions: AgentExtension[] = [
      {
        name: "first",
        hooks: {
          beforeToolCall() {
            calls.push("first");
          },
        },
      },
      {
        name: "blocker",
        hooks: {
          async beforeToolCall() {
            calls.push("blocker");
            throw new Error("blocked");
          },
        },
      },
      {
        name: "never",
        hooks: {
          beforeToolCall() {
            calls.push("never");
          },
        },
      },
    ];

    const host = createExtensionHost(extensions);

    await expect(
      host.beforeToolCall({
        turnIndex: 0,
        toolCall: {
          type: "toolCall",
          id: "call-1",
          name: "test_tool",
          arguments: {},
        },
      }),
    ).rejects.toThrow("blocked");

    expect(calls).toEqual(["first", "blocker"]);
  });

  it("stops later hooks when a tool call is blocked", async () => {
    const calls: string[] = [];

    const host = createExtensionHost([
      {
        name: "blocker",
        hooks: {
          beforeToolCall() {
            calls.push("blocker");
            return { block: true, reason: "no budget" };
          },
        },
      },
      {
        name: "later",
        hooks: {
          beforeToolCall() {
            calls.push("later");
          },
        },
      },
    ]);

    const result = await host.beforeToolCall({
      turnIndex: 0,
      toolCall: {
        type: "toolCall",
        id: "call-1",
        name: "echo",
        arguments: {},
      },
    });

    expect(result).toEqual({
      block: true,
      reason: "no budget",
    });
    expect(calls).toEqual(["blocker"]);
  });

  it("runs hooks in registration order", async () => {
    const calls: string[] = [];

    const createExtension = (name: string): AgentExtension => ({
      name,
      hooks: {
        onTurnStart() {
          calls.push(name);
        },
      },
    });

    const host = createExtensionHost([
      createExtension("a"),
      createExtension("b"),
      createExtension("c"),
    ]);

    await host.onTurnStart({ turnIndex: 0 });

    expect(calls).toEqual(["a", "b", "c"]);
  });
});
