import { fileURLToPath } from "node:url";

import Schema from "typebox/schema";
import { afterEach, describe, expect, it } from "vitest";

import { connectMcpServer, type McpConnection } from "../src/mcp/mcp-client.js";
import { createMcpTools } from "../src/mcp/mcp-tools.js";

const fixture = fileURLToPath(new URL("./fixtures/mcp-test-server.mjs", import.meta.url));
const connections: McpConnection[] = [];
const connect = async () => {
  const connection = await connectMcpServer({ name: "fixture", command: process.execPath, args: [fixture] });
  connections.push(connection);
  return connection;
};

afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.close()));
});

describe("createMcpTools", () => {
  it("adapts names and schemas for Agent Loop validation", async () => {
    const { tools, warnings, definitionChars } = createMcpTools(await connect());
    expect(warnings).toEqual([]);
    expect(definitionChars).toBeGreaterThan(0);
    expect(tools.map((tool) => tool.name)).toContain("mcp__fixture__bad_name_");
    const echo = tools.find((tool) => tool.name === "mcp__fixture__echo")!;
    expect(echo.label).toBe("fixture/echo");
    expect(echo.description).toBe("[MCP fixture] Echo text");
    expect(echo.parameters).not.toHaveProperty("$schema");
    const validator = Schema.Compile(echo.parameters);
    expect(validator.Check({ text: "hello" })).toBe(true);
    expect(validator.Check({ text: 42 })).toBe(false);
  });

  it("converts MCP results without exposing binary data", async () => {
    const { tools } = createMcpTools(await connect());
    const get = (name: string) => tools.find((tool) => tool.name === `mcp__fixture__${name}`)!;
    expect((await get("echo").execute("1", { text: "hello" })).content).toEqual([{ type: "text", text: "hello" }]);
    const image = await get("image").execute("2", {});
    expect(image.content).toEqual([{ type: "text", text: "[image: image/png, 约 1KB，未展示]" }]);
    expect(JSON.stringify(image)).not.toContain("iVBORw0KGgo");
    const big = await get("big").execute("3", {});
    expect(big.content[0]?.text).toContain("[输出过长，已截断 10000 个字符]");
    expect(big.details).toEqual({ server: "fixture", tool: "big", truncated: true });
    expect((await get("structured").execute("4", {})).content).toEqual([{ type: "text", text: '{"answer":42}' }]);
    expect((await get("fail").execute("5", {})).isError).toBe(true);
    expect((await get("echo").execute("6", { text: 42 })).isError).toBe(true);
  });

  it("skips long, colliding, and invalid tool definitions", () => {
    const connection = {
      name: "fixture",
      serverInfo: undefined,
      tools: [
        { name: "x".repeat(65), inputSchema: { type: "object" } },
        { name: "bad.name!", inputSchema: { type: "object" } },
        { name: "bad_name_", inputSchema: { type: "object" } },
        { name: "array", inputSchema: { type: "array" } },
        { name: "invalid", inputSchema: { type: "object", properties: { x: { type: "string", pattern: "[" } } } },
      ],
      callTool: async () => ({ content: [] }),
      stderrTail: () => [],
      close: async () => {},
    } as unknown as McpConnection;
    const { tools, warnings } = createMcpTools(connection);
    expect(tools.map((tool) => tool.name)).toEqual(["mcp__fixture__bad_name_"]);
    expect(warnings).toEqual([
      expect.stringContaining("exceeds 64 characters"),
      expect.stringContaining("collides"),
      expect.stringContaining("not object"),
      expect.stringContaining("Invalid regular expression"),
    ]);
  });

  it("renders resources and links as text", async () => {
    const connection: McpConnection = {
      name: "fixture",
      serverInfo: undefined,
      tools: [{ name: "resources", inputSchema: { type: "object" } }],
      callTool: async () => ({ content: [
        { type: "resource", resource: { uri: "file:///a", text: "hello" } },
        { type: "resource", resource: { uri: "file:///b", blob: "AAAA", mimeType: "application/octet-stream" } },
        { type: "resource_link", uri: "file:///c", name: "c" },
      ] }),
      stderrTail: () => [],
      close: async () => {},
    };
    const result = await createMcpTools(connection).tools[0]!.execute("1", {});
    expect(result.content).toEqual([{ type: "text", text: "[resource: file:///a]\nhello\n[resource: file:///b, application/octet-stream]\n[resource link: file:///c]" }]);
    expect(JSON.stringify(result)).not.toContain("AAAA");
  });

  it("prefixes a thrown SDK error and rethrows it", async () => {
    const sdkError = new Error("connection closed");
    const connection: McpConnection = {
      name: "fixture",
      serverInfo: undefined,
      tools: [{ name: "echo", inputSchema: { type: "object" } }],
      callTool: async () => { throw sdkError; },
      stderrTail: () => [],
      close: async () => {},
    };
    await expect(createMcpTools(connection).tools[0]!.execute("1", {})).rejects.toBe(sdkError);
    expect(sdkError.message).toBe("MCP server fixture: connection closed");
  });
});
