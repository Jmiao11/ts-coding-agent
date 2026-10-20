import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadMcpConfig,
  loadMcpTrust,
  mcpTrustKey,
  parseMcpConfig,
  saveMcpTrust,
} from "../src/mcp/mcp-config.js";

const directories: string[] = [];
const temp = async () => {
  const path = await mkdtemp(join(tmpdir(), "agent-harness-mcp-"));
  directories.push(path);
  return path;
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("MCP config", () => {
  it("validates fields, expands host variables, and keeps values out of warnings", () => {
    const { servers, warnings } = parseMcpConfig({ mcpServers: {
      good: { command: "node", env: { TOKEN: "prefix-${MCP_TOKEN}" }, tools: ["echo"], autoApprove: ["echo"] },
      "bad.name": { command: "node" },
      badArgs: { command: "node", args: "wrong" },
      missing: { command: "node", env: { TOKEN: "${UNKNOWN_SECRET}" } },
    } }, "project", "C:\\work", { MCP_TOKEN: "secret-value" });
    expect(servers).toMatchObject([{ name: "good", cwd: "C:\\work", env: { TOKEN: "prefix-secret-value" }, tools: ["echo"], autoApprove: ["echo"] }]);
    expect(warnings).toHaveLength(3);
    expect(warnings.join(" ")).toContain("UNKNOWN_SECRET");
    expect(warnings.join(" ")).not.toContain("secret-value");
    expect(parseMcpConfig({ mcpServers: [] }, "user", "C:\\work", {}).servers).toEqual([]);
  });

  it("reads both files and gives user config precedence", async () => {
    const root = await temp();
    const home = join(root, "home");
    const workspace = join(root, "workspace");
    await mkdir(join(home, ".agent-harness"), { recursive: true });
    await mkdir(workspace);
    await writeFile(join(home, ".agent-harness", "mcp.json"), JSON.stringify({ mcpServers: {
      shared: { command: "user" },
    } }));
    await writeFile(join(workspace, ".mcp.json"), JSON.stringify({ mcpServers: {
      shared: { command: "project" },
      local: { command: "node" },
    } }));
    const loaded = await loadMcpConfig(workspace, home, {});
    expect(loaded.servers.map((server) => [server.name, server.command, server.source])).toEqual([
      ["shared", "user", "user"], ["local", "node", "project"],
    ]);
    expect(loaded.warnings).toEqual([expect.stringContaining("overrides")]);
    await writeFile(join(workspace, ".mcp.json"), "{ broken");
    expect((await loadMcpConfig(workspace, home, {})).warnings).toEqual([expect.stringContaining("could not read or parse")]);
  });

  it("changes trust for command or args, but not environment values", async () => {
    const root = await temp();
    const [server] = parseMcpConfig({ mcpServers: { test: { command: "node", args: ["a"], env: { KEY: "first" } } } }, "project", root, {}).servers;
    expect(server).toBeDefined();
    const key = mcpTrustKey(root, server!);
    expect(mcpTrustKey(root, { ...server!, command: "other" })).not.toBe(key);
    expect(mcpTrustKey(root, { ...server!, args: ["b"] })).not.toBe(key);
    expect(mcpTrustKey(root, { ...server!, env: { KEY: "second" } })).toBe(key);
    await saveMcpTrust(new Set([key]), root);
    expect((await loadMcpTrust(root)).trusted.has(key)).toBe(true);
    expect(await readFile(join(root, ".agent-harness", "mcp-trust.json"), "utf8")).not.toContain("first");
  });
});
