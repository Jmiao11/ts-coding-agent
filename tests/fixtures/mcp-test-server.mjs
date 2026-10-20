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
server.registerTool("image", { description: "Return a tiny PNG" }, () => ({ content: [{
  type: "image",
  mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=",
}] }));
server.registerTool("big", { description: "Return long text" }, () => text("x".repeat(60_000)));
server.registerTool("structured", { description: "Return structured data" }, () => ({ content: [], structuredContent: { answer: 42 } }));
server.registerTool("bad.name!", { description: "Name needs sanitizing" }, () => text("renamed"));

await server.connect(new StdioServerTransport());
