import { readFile } from "node:fs/promises";

import { Client, type CallToolResult, type Tool } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";

export type McpServerConfig = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type McpConnection = {
  name: string;
  serverInfo: { name: string; version: string } | undefined;
  tools: Pick<Tool, "name" | "description" | "inputSchema">[];
  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CallToolResult>;
  stderrTail(): string[];
  close(): Promise<void>;
};

export async function connectMcpServer(
  config: McpServerConfig,
  options: { timeoutMs?: number } = {},
): Promise<McpConnection> {
  const { version } = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  const client = new Client({ name: "ts-coding-agent", version });
  const transport = new StdioClientTransport({
    command: config.command,
    ...(config.args && { args: config.args }),
    ...(config.cwd && { cwd: config.cwd }),
    stderr: "pipe",
    // Only the SDK allowlist and explicit overrides reach third-party servers; never forward all of process.env.
    env: { ...getDefaultEnvironment(), ...config.env },
  });

  const lines: string[] = [];
  let pending = "";
  transport.stderr?.on("data", (chunk: Buffer) => {
    pending += chunk.toString();
    const parts = pending.split(/\r?\n/);
    pending = parts.pop() ?? "";
    lines.push(...parts);
    if (lines.length > 50) lines.splice(0, lines.length - 50);
  });
  const stderrTail = () => [...lines, ...(pending ? [pending] : [])].slice(-50);

  let closed = false;
  let closing: Promise<void> | undefined;
  const close = () => {
    closed = true;
    return closing ??= client.close();
  };

  const timeoutMs = options.timeoutMs ?? 30_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const tools = await Promise.race([
      (async () => {
        await client.connect(transport);
        return (await client.listTools()).tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`timed out after ${timeoutMs} ms`));
        }, timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    const serverInfo = client.getServerVersion();
    return {
      name: config.name,
      serverInfo: serverInfo && { name: serverInfo.name, version: serverInfo.version },
      tools,
      async callTool(name, args, signal) {
        if (closed) throw new Error(`MCP server "${config.name}" is closed`);
        return client.callTool({ name, arguments: args }, signal ? { signal } : undefined);
      },
      stderrTail,
      close,
    };
  } catch (error) {
    clearTimeout(timer);
    if (timedOut && transport.pid) {
      try { process.kill(transport.pid); } catch { /* The process may have exited. */ }
    }
    await close();
    const detail = error instanceof Error ? error.message : String(error);
    const tail = stderrTail();
    throw new Error(`MCP server "${config.name}" (${config.command}) failed: ${detail}${tail.length ? `\nstderr:\n${tail.join("\n")}` : ""}`, { cause: error });
  }
}
