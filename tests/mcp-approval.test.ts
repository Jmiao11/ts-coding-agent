import { describe, expect, it } from "vitest";

import { createMcpApprovalExtension } from "../src/mcp/mcp-approval.js";

const toolCall = (name: string, args: Record<string, unknown>) => ({
  turnIndex: 0,
  toolCall: { type: "toolCall" as const, id: "call-1", name, arguments: args },
});

describe("MCP approval", () => {
  it("asks for an MCP call and blocks it on rejection", async () => {
    const questions: string[] = [];
    const extension = createMcpApprovalExtension({ confirm: async (question) => {
      questions.push(question);
      return false;
    } }, [{ name: "mcp__filesystem__write_file", label: "filesystem/write_file", autoApprove: false }]);
    const result = await extension.hooks.beforeToolCall?.(toolCall("mcp__filesystem__write_file", { content: "x".repeat(600) }));
    expect(questions).toHaveLength(1);
    expect(questions[0]).toContain("⚠ Agent 想调用 MCP 工具 filesystem/write_file");
    expect(questions[0]!.length).toBeLessThan(560);
    expect(result).toMatchObject({ block: true, reason: expect.stringContaining("The user rejected") });
  });

  it("does not ask for autoApprove or built-in tools", async () => {
    let asked = 0;
    const extension = createMcpApprovalExtension({ confirm: async () => { asked++; return true; } }, [
      { name: "mcp__filesystem__list_directory", label: "filesystem/list_directory", autoApprove: true },
    ]);
    expect(await extension.hooks.beforeToolCall?.(toolCall("mcp__filesystem__list_directory", {}))).toBeUndefined();
    expect(await extension.hooks.beforeToolCall?.(toolCall("run_command", { command: "git status" }))).toBeUndefined();
    expect(asked).toBe(0);
  });
});
