import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod/v4";

const server = new McpServer({ name: "mcp-test-server", version: "1.0.0" });
const text = (value) => ({ content: [{ type: "text", text: value }] });
console.error(`PID:${process.pid}`);

server.registerTool("echo", { description: "Echo text", inputSchema: z.object({ text: z.string() }) }, ({ text: value }) => text(value));
server.registerTool("fail", { description: "Return a tool error" }, () => ({ ...text("failed"), isError: true }));
server.registerTool("slow", { description: "Wait ten seconds" }, async () => {
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  return text("done");
});
server.registerTool("print_env", { description: "Read an environment variable", inputSchema: z.object({ name: z.string() }) }, ({ name }) => text(process.env[name] ?? ""));

await server.connect(new StdioServerTransport());
