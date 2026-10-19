import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AgentEvent,
} from "../src/agent/types.js";

import {
  describeToolCall,
  showToolActivity,
} from "../src/ui/tool-activity.js";


describe("describeToolCall", () => {
  it("picks the primary argument for each tool", () => {
    expect(describeToolCall("list_directory", { path: "src" })).toBe("src");
    expect(describeToolCall("read_file", { path: "README.md" })).toBe("README.md");
    expect(describeToolCall("write_file", { path: "a.ts", content: "long content" })).toBe("a.ts");
    expect(describeToolCall("edit_file", { path: "a.ts" })).toBe("a.ts");
    expect(describeToolCall("run_command", { command: "pnpm test", timeoutSeconds: 600 })).toBe("pnpm test");
    expect(describeToolCall("search_text", { pattern: "createTuiView", path: "src" })).toBe("createTuiView");
    expect(describeToolCall("task", { description: "看 a.ts", prompt: "很长的说明……" })).toBe("看 a.ts");
  });

  it("keeps the summary on one short line", () => {
    const long = `echo ${"x".repeat(200)}\nsecond line`;
    const summary = describeToolCall("run_command", { command: long });

    expect(summary).not.toContain("\n");
    expect(summary.length).toBeLessThanOrEqual(60);
    expect(summary.endsWith("…")).toBe(true);
    expect(describeToolCall("run_command", { command: "  echo\tfirst\nsecond  " })).toBe("echo first second");
  });

  it("returns no summary for unknown tools or odd arguments", () => {
    expect(describeToolCall("mystery_tool", { foo: "bar" })).toBe("");
    expect(describeToolCall("read_file", null)).toBe("");
    expect(describeToolCall("read_file", "README.md")).toBe("");
    expect(describeToolCall("read_file", {})).toBe("");
    expect(describeToolCall("read_file", { path: 123 })).toBe("");
  });
});


describe("showToolActivity", () => {
  it("forwards tool events by call id even when tools finish out of order", () => {
    const calls: string[] = [];
    const onEvent = showToolActivity({
      toolStart: (id, name, summary) => calls.push(`start ${id} ${name} ${summary}`),
      toolEnd: (id, ok) => calls.push(`end ${id} ${ok ? "ok" : "failed"}`),
    });

    const events: AgentEvent[] = [
      { type: "tool_execution_start", toolCallId: "a", toolName: "read_file", args: { path: "README.md" } },
      { type: "tool_execution_start", toolCallId: "b", toolName: "run_command", args: { command: "pnpm test" } },
      { type: "tool_execution_end", toolCallId: "b", toolName: "run_command", result: {}, isError: true },
      { type: "tool_execution_end", toolCallId: "a", toolName: "read_file", result: {}, isError: false },
      { type: "agent_start" },
    ];

    events.forEach(onEvent);

    expect(calls).toEqual([
      "start a read_file README.md",
      "start b run_command pnpm test",
      "end b failed",
      "end a ok",
    ]);
  });
});
