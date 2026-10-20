import { connectMcpServer } from "../dist/mcp/mcp-client.js";
import { createMcpTools } from "../dist/mcp/mcp-tools.js";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/mcp-probe.mjs <command> [args...]");
  process.exitCode = 1;
} else {
  const connection = await connectMcpServer({ name: command, command, args });
  try {
    console.log(`Server: ${connection.serverInfo?.name ?? "unknown"} ${connection.serverInfo?.version ?? ""}`);
    const { tools, warnings, definitionChars } = createMcpTools(connection);
    for (const tool of tools) console.log(`${tool.name}: ${tool.description}`);
    if (warnings.length === 0) console.log("Warnings: none");
    for (const warning of warnings) console.log(`Warning: ${warning}`);
    console.log(`Definition chars: ${definitionChars} (~${Math.ceil(definitionChars / 4)} tokens)`);
  } finally {
    await connection.close();
  }
}
