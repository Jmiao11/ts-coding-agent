import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { connectMcpServer, type McpConnection } from "../src/mcp/mcp-client.js";

const fixture = fileURLToPath(new URL("./fixtures/mcp-test-server.mjs", import.meta.url));
const connections: McpConnection[] = [];
const connect = async (env?: Record<string, string>) => {
  const connection = await connectMcpServer({ name: "fixture", command: process.execPath, args: [fixture], ...(env && { env }) });
  connections.push(connection);
  return connection;
};

afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.close()));
});

describe("connectMcpServer", () => {
  it("discovers tools with JSON Schema and calls them", async () => {
    const connection = await connect();
    expect(connection.serverInfo).toEqual({ name: "mcp-test-server", version: "1.0.0" });
    expect(connection.tools.map((tool) => tool.name)).toEqual(["echo", "fail", "slow", "print_env", "image", "big", "structured", "bad.name!"]);
    expect(connection.tools.find((tool) => tool.name === "echo")?.inputSchema).toMatchObject({
      type: "object",
      properties: { text: { type: "string" } },
    });
    expect((await connection.callTool("echo", { text: "hello" })).content).toEqual([{ type: "text", text: "hello" }]);
    expect((await connection.callTool("fail", {})).isError).toBe(true);
    await expect(connection.callTool("missing", {})).rejects.toThrow();
  });

  it("aborts a slow tool call promptly", async () => {
    const connection = await connect();
    const controller = new AbortController();
    const started = Date.now();
    const call = connection.callTool("slow", {}, controller.signal);
    setTimeout(() => controller.abort(), 50);
    await expect(call).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("only passes explicitly configured secret variables", async () => {
    const previous = process.env.MCP_TEST_SECRET;
    process.env.MCP_TEST_SECRET = "private-value";
    try {
      const isolated = await connect();
      expect((await isolated.callTool("print_env", { name: "MCP_TEST_SECRET" })).content).toEqual([{ type: "text", text: "" }]);
      const configured = await connect({ MCP_TEST_SECRET: "shared-value" });
      expect((await configured.callTool("print_env", { name: "MCP_TEST_SECRET" })).content).toEqual([{ type: "text", text: "shared-value" }]);
    } finally {
      if (previous === undefined) delete process.env.MCP_TEST_SECRET;
      else process.env.MCP_TEST_SECRET = previous;
    }
  });

  it("reports a missing command", async () => {
    await expect(connectMcpServer({ name: "missing-server", command: "missing-mcp-command-928573" }, { timeoutMs: 1_000 }))
      .rejects.toThrow(/missing-server.*missing-mcp-command-928573/);
  });

  it("reports a missing cwd before spawning", async () => {
    const cwd = join(tmpdir(), `missing-mcp-cwd-${randomUUID()}`);
    const connection = connectMcpServer({ name: "fixture", command: process.execPath, cwd });
    await expect(connection).rejects.toThrow(cwd);
    await expect(connection).rejects.not.toThrow(/ENOENT/);
  });

  it("closes the subprocess and rejects later calls", async () => {
    const connection = await connect();
    const pid = Number(connection.stderrTail().find((line) => line.startsWith("PID:"))?.slice(4));
    expect(pid).toBeGreaterThan(0);
    await connection.close();
    await connection.close();
    expect(() => process.kill(pid, 0)).toThrow();
    await expect(connection.callTool("echo", { text: "late" })).rejects.toThrow(/closed/);
  });
});
