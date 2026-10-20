import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { McpServerConfig } from "./mcp-client.js";

export type ConfiguredMcpServer = McpServerConfig & {
  source: "user" | "project";
  tools?: string[];
  autoApprove?: string[];
};

export function parseMcpConfig(
  value: unknown,
  source: ConfiguredMcpServer["source"],
  workspace: string,
  hostEnv: NodeJS.ProcessEnv,
): { servers: ConfiguredMcpServer[]; warnings: string[] } {
  const servers: ConfiguredMcpServer[] = [];
  const warnings: string[] = [];
  if (!isRecord(value) || !isRecord(value.mcpServers)) {
    return { servers, warnings: [`${source} MCP config: mcpServers must be an object`] };
  }

  for (const [name, raw] of Object.entries(value.mcpServers)) {
    const prefix = `${source} MCP server ${name}`;
    if (!/^[a-zA-Z0-9_-]+$/.test(name) || !isRecord(raw)
      || typeof raw.command !== "string" || !raw.command
      || !isStrings(raw.args) || !isStringRecord(raw.env)
      || (raw.cwd !== undefined && typeof raw.cwd !== "string")
      || !isStrings(raw.tools) || !isStrings(raw.autoApprove)) {
      warnings.push(`${prefix}: invalid name or field type; skipped`);
      continue;
    }

    const env: Record<string, string> = {};
    const missing = new Set<string>();
    for (const [key, template] of Object.entries(raw.env ?? {})) {
      env[key] = template.replace(/\$\{([^}]+)\}/g, (_, variable: string) => {
        const found = hostEnv[variable];
        if (found === undefined) missing.add(variable);
        return found ?? "";
      });
    }
    if (missing.size > 0) {
      warnings.push(`${prefix}: missing environment variable(s): ${[...missing].join(", ")}; skipped`);
      continue;
    }

    servers.push({
      name,
      command: raw.command,
      ...(raw.args && { args: raw.args }),
      env,
      cwd: raw.cwd ?? workspace,
      source,
      ...(raw.tools && { tools: raw.tools }),
      ...(raw.autoApprove && { autoApprove: raw.autoApprove }),
    });
  }
  return { servers, warnings };
}

export function mergeMcpConfigs(
  user: ReturnType<typeof parseMcpConfig>,
  project: ReturnType<typeof parseMcpConfig>,
): { servers: ConfiguredMcpServer[]; warnings: string[] } {
  const names = new Set(user.servers.map((server) => server.name));
  return {
    servers: [...user.servers, ...project.servers.filter((server) => !names.has(server.name))],
    warnings: [...user.warnings, ...project.warnings,
      ...project.servers.filter((server) => names.has(server.name))
        .map((server) => `MCP server ${server.name}: user config overrides project config`)],
  };
}

export function mcpTrustKey(workspace: string, server: ConfiguredMcpServer): string {
  return createHash("sha256").update(JSON.stringify([
    resolve(workspace), server.name, server.command, server.args ?? [],
    Object.keys(server.env ?? {}).sort(), server.cwd ?? workspace,
  ])).digest("hex");
}

export async function loadMcpConfig(
  workspace: string,
  home = homedir(),
  hostEnv = process.env,
): Promise<{ servers: ConfiguredMcpServer[]; warnings: string[] }> {
  const read = async (path: string, source: ConfiguredMcpServer["source"]) => {
    try {
      return parseMcpConfig(JSON.parse(await readFile(path, "utf8")), source, workspace, hostEnv);
    } catch (error) {
      return {
        servers: [] as ConfiguredMcpServer[],
        warnings: isMissingFile(error) ? [] : [`${source} MCP config: could not read or parse file`],
      };
    }
  };
  return mergeMcpConfigs(
    await read(join(home, ".agent-harness", "mcp.json"), "user"),
    await read(join(workspace, ".mcp.json"), "project"),
  );
}

export async function loadMcpTrust(home = homedir()): Promise<{ trusted: Set<string>; warnings: string[] }> {
  try {
    const value: unknown = JSON.parse(await readFile(join(home, ".agent-harness", "mcp-trust.json"), "utf8"));
    if (!isRecord(value) || !Array.isArray(value.trusted) || !value.trusted.every((key) => typeof key === "string")) {
      throw new Error("invalid format");
    }
    return { trusted: new Set(value.trusted), warnings: [] };
  } catch (error) {
    return { trusted: new Set(), warnings: isMissingFile(error) ? [] : ["MCP trust file: could not read or parse file"] };
  }
}

export async function saveMcpTrust(trusted: Set<string>, home = homedir()): Promise<void> {
  const dir = join(home, ".agent-harness");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "mcp-trust.json"), JSON.stringify({ trusted: [...trusted] }, null, 2) + "\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrings(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function isStringRecord(value: unknown): value is Record<string, string> | undefined {
  return value === undefined || (isRecord(value) && Object.values(value).every((item) => typeof item === "string"));
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
