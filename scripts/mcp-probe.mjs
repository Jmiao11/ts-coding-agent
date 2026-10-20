import { connectMcpServer } from "../dist/mcp/mcp-client.js";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/mcp-probe.mjs <command> [args...]");
  process.exitCode = 1;
} else {
  const connection = await connectMcpServer({ name: command, command, args });
  try {
    console.log(`Server: ${connection.serverInfo?.name ?? "unknown"} ${connection.serverInfo?.version ?? ""}`);
    for (const tool of connection.tools) console.log(`${tool.name}: ${tool.description ?? ""}`);
  } finally {
    await connection.close();
  }
}
