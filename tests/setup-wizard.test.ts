import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  parseEnv,
} from "node:util";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  DEEPSEEK_BASE_URL,
  detectAvailableSandboxes,
  runSetupWizard,
  type FetchLike,
  type SetupIO,
} from "../src/config/setup-wizard.js";

import {
  resolveSettings,
} from "../src/config/settings.js";


function scriptedIO(
  answers: (string | null)[],
): { io: SetupIO; output: string[] } {
  let index = 0;
  const output: string[] = [];

  return {
    io: {
      write(text) {
        output.push(text);
      },
      async ask(prompt) {
        output.push(prompt);
        return answers[index++] ?? null;
      },
      async askSecret(prompt) {
        output.push(prompt);
        return answers[index++] ?? null;
      },
    },
    output,
  };
}


function successfulFetch(
  model = "deepseek-flash",
): { fetchFn: FetchLike; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];

  return {
    calls,
    fetchFn: async (url, init) => {
      calls.push({ url, init });

      return new Response(
        JSON.stringify({ data: [{ id: model }] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  };
}


describe("runSetupWizard", () => {
  let directory: string;
  let envFile: string;
  let settingsPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-setup-"));
    envFile = join(directory, "test.env");
    settingsPath = join(directory, "config.json");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("writes the env file and never prints the key", async () => {
    const key = "sk-test-secret-123456";
    const { io, output } = scriptedIO([
      "1",
      key,
      "",
      "",
      "",
      "",
    ]);
    const { fetchFn, calls } = successfulFetch();
    const settings = resolveSettings();

    const result = await runSetupWizard({
      envFile,
      settingsPath,
      settings,
      currentEnv: {},
      io,
      fetchFn,
      availableSandboxes: ["host"],
    });

    expect(result.status).toBe("saved");
    expect(result.status === "saved" && result.changed).toEqual([]);

    const env = parseEnv(readFileSync(envFile, "utf8"));
    expect(env).toEqual({
      AGENT_BASE_URL: DEEPSEEK_BASE_URL,
      AGENT_API_KEY: key,
      AGENT_MODEL: "deepseek-flash",
    });

    expect(calls[0]?.url).toBe(`${DEEPSEEK_BASE_URL}/models`);
    expect((calls[0]?.init.headers as Record<string, string>).Authorization)
      .toBe(`Bearer ${key}`);

    const printed = output.join("");
    expect(printed).not.toContain(key);
    expect(printed).toContain(`已输入 ${key.length} 个字符`);
    expect(printed).toContain(`API Key：已保存（${key.length} 个字符）`);
    expect(existsSync(settingsPath)).toBe(false);
  });

  it("keeps existing values when the user just presses enter", async () => {
    const key = "sk-existing-key";
    writeFileSync(
      envFile,
      [
        "# keep this comment",
        `AGENT_API_KEY='${key}'`,
        "AGENT_BASE_URL='https://custom.example/v1'",
        "AGENT_MODEL='custom-model'",
        "AGENT_THINKING=disabled",
        "",
      ].join("\n"),
      "utf8",
    );

    const { io, output } = scriptedIO([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    const { fetchFn, calls } = successfulFetch("custom-model");

    const result = await runSetupWizard({
      envFile,
      settingsPath,
      settings: resolveSettings(),
      currentEnv: {
        apiKey: key,
        baseUrl: "https://custom.example/v1",
        model: "custom-model",
      },
      io,
      fetchFn,
      availableSandboxes: ["host"],
    });

    expect(result.status).toBe("saved");
    expect(calls[0]?.url).toBe("https://custom.example/v1/models");

    expect(parseEnv(readFileSync(envFile, "utf8"))).toEqual({
      AGENT_API_KEY: key,
      AGENT_BASE_URL: "https://custom.example/v1",
      AGENT_MODEL: "custom-model",
      AGENT_THINKING: "disabled",
    });

    expect(readFileSync(envFile, "utf8")).toContain("# keep this comment");
    expect(output.join("")).not.toContain(key);
  });

  it("writes nothing when the connection test fails and the user does not save", async () => {
    const key = "sk-test-failure";
    const { io, output } = scriptedIO([
      "1",
      key,
      "",
      "n",
    ]);

    const result = await runSetupWizard({
      envFile,
      settingsPath,
      settings: resolveSettings(),
      currentEnv: {},
      io,
      fetchFn: async () => {
        throw new Error("network down");
      },
      availableSandboxes: ["host"],
    });

    expect(result).toEqual({ status: "declined" });
    expect(existsSync(envFile)).toBe(false);
    expect(existsSync(settingsPath)).toBe(false);

    const printed = output.join("");
    expect(printed).toContain("网络错误：network down");
    expect(printed).toContain("仍然保存吗？");
    expect(printed).toContain("未保存。");
    expect(printed).not.toContain(key);
  });

  it("retries with a small chat completion when /models returns 404", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, init });

      if (url.endsWith("/models")) {
        return new Response("not found", { status: 404 });
      }

      return new Response("{}", { status: 200 });
    };

    const { io, output } = scriptedIO([
      "1",
      "sk-test-404",
      "",
      "",
      "",
      "",
    ]);

    const result = await runSetupWizard({
      envFile,
      settingsPath,
      settings: resolveSettings(),
      currentEnv: {},
      io,
      fetchFn,
      availableSandboxes: ["host"],
    });

    expect(result.status).toBe("saved");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe(`${DEEPSEEK_BASE_URL}/chat/completions`);
    expect(String(calls[1]?.init.body)).toContain('"max_tokens":1');
    expect(output.join("")).toContain("改用最小的 chat completion 测试");
  });

  it("saves only the settings that changed", async () => {
    const { io, output } = scriptedIO([
      "1",
      "sk-test-settings",
      "",
      "2",
      "1",
      "3",
    ]);
    const { fetchFn } = successfulFetch();

    const result = await runSetupWizard({
      envFile,
      settingsPath,
      settings: resolveSettings(),
      currentEnv: {},
      io,
      fetchFn,
      availableSandboxes: ["host"],
    });

    expect(result.status).toBe("saved");
    expect(result.status === "saved" && result.changed)
      .toEqual(["ui", "nonGitDirectory"]);

    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      ui: "plain",
      nonGitDirectory: "allow",
    });

    expect(output.join("")).toContain("config.json：ui、nonGitDirectory");
  });
});


describe("detectAvailableSandboxes", () => {
  it("lists only what this machine can use", async () => {
    const directory = mkdtempSync(join(tmpdir(), "agent-sandbox-"));
    const codex = join(directory, "codex.exe");
    writeFileSync(codex, "", "utf8");

    try {
      expect(await detectAvailableSandboxes({
        platform: "win32",
        nodeVersion: "24.0.0",
        env: { AGENT_CODEX_EXE: codex },
        importModule: async () => ({}),
      })).toEqual(["host", "codex", "mxc"]);

      expect(await detectAvailableSandboxes({
        platform: "linux",
        nodeVersion: "24.0.0",
        env: {},
        importModule: async () => ({}),
      })).toEqual(["host"]);

      expect(await detectAvailableSandboxes({
        platform: "win32",
        nodeVersion: "22.0.0",
        env: {},
        importModule: async () => ({}),
      })).toEqual(["host"]);

      expect(await detectAvailableSandboxes({
        platform: "win32",
        nodeVersion: "24.0.0",
        env: {},
        importModule: async () => {
          throw new Error("missing");
        },
      })).toEqual(["host"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
