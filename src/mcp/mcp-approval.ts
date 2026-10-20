import type { AgentExtension } from "../agent/extension.js";
import type { AgentView } from "../ui/agent-view.js";

export function createMcpApprovalExtension(
  view: Pick<AgentView, "confirm">,
  tools: readonly { name: string; label: string; autoApprove: boolean }[],
): AgentExtension {
  const approvals = new Map(tools.map((tool) => [tool.name, tool]));
  return {
    name: "mcp-approval",
    hooks: {
      async beforeToolCall({ toolCall }) {
        if (!toolCall.name.startsWith("mcp__")) return;
        const tool = approvals.get(toolCall.name);
        if (tool?.autoApprove) return;
        const label = tool?.label ?? toolCall.name;
        const parameters = JSON.stringify(toolCall.arguments);
        const shown = parameters.length > 500 ? `${parameters.slice(0, 500)}…` : parameters;
        if (await view.confirm(`⚠ Agent 想调用 MCP 工具 ${label}\n${shown}`)) return;
        return {
          block: true,
          reason: `The user rejected this MCP tool call: ${label}. Do not retry it; use another approach or explain what you need.`,
        };
      },
    },
  };
}
