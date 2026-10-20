import Schema from "typebox/schema";

import type { AgentTool } from "../agent/types.js";
import type { McpConnection } from "./mcp-client.js";

const MAX_OUTPUT_CHARS = 50_000;
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, "_");

export function createMcpTools(connection: McpConnection): {
  tools: AgentTool[];
  warnings: string[];
  definitionChars: number;
} {
  const tools: AgentTool[] = [];
  const warnings: string[] = [];
  const names = new Set<string>();
  let definitionChars = 0;

  for (const tool of connection.tools) {
    const name = `mcp__${safeName(connection.name)}__${safeName(tool.name)}`;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      warnings.push(`Skipped MCP tool ${connection.name}/${tool.name}: adapted name exceeds 64 characters`);
      continue;
    }
    if (names.has(name)) {
      warnings.push(`Skipped MCP tool ${connection.name}/${tool.name}: adapted name ${name} collides with another tool`);
      continue;
    }

    const { $schema: _schema, ...parameters } = tool.inputSchema;
    if (parameters.type !== "object") {
      warnings.push(`Skipped MCP tool ${connection.name}/${tool.name}: inputSchema type is not object`);
      continue;
    }
    try {
      Schema.Compile(parameters);
    } catch (error) {
      warnings.push(`Skipped MCP tool ${connection.name}/${tool.name}: invalid inputSchema: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const description = tool.description ? `[MCP ${connection.name}] ${tool.description}` : `[MCP ${connection.name}]`;
    names.add(name);
    // Approximate the context cost of tool definitions before handing them to a model.
    definitionChars += name.length + description.length + JSON.stringify(parameters).length;
    tools.push({
      name,
      label: `${connection.name}/${tool.name}`,
      description,
      parameters,
      async execute(_toolCallId, params, signal) {
        let result;
        try {
          result = await connection.callTool(tool.name, params as Record<string, unknown>, signal);
        } catch (error) {
          if (error instanceof Error) {
            error.message = `MCP server ${connection.name}: ${error.message}`;
            throw error;
          }
          throw new Error(`MCP server ${connection.name}: ${String(error)}`, { cause: error });
        }

        const parts = result.content.map((item) => {
          switch (item.type) {
            case "text": return item.text;
            case "image":
            case "audio": return `[${item.type}: ${item.mimeType}, 约 ${Math.ceil(item.data.length * 3 / 4 / 1024)}KB，未展示]`;
            case "resource": return "text" in item.resource
              ? `[resource: ${item.resource.uri}]\n${item.resource.text}`
              : `[resource: ${item.resource.uri}, ${item.resource.mimeType ?? "application/octet-stream"}]`;
            case "resource_link": return `[resource link: ${item.uri}]`;
            default: return "";
          }
        });
        if (parts.length === 0 && result.structuredContent !== undefined) parts.push(JSON.stringify(result.structuredContent));
        const output = parts.join("\n");
        const truncated = Math.max(0, output.length - MAX_OUTPUT_CHARS);
        return {
          content: [{ type: "text", text: truncated
            ? `${output.slice(0, MAX_OUTPUT_CHARS)}[输出过长，已截断 ${truncated} 个字符]`
            : output }],
          ...(result.isError !== undefined && { isError: result.isError }),
          details: { server: connection.name, tool: tool.name, truncated: truncated > 0 },
        };
      },
    });
  }

  return { tools, warnings, definitionChars };
}
