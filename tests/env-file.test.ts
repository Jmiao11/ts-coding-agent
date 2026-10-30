import {
  parseEnv,
} from "node:util";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  formatEnvValue,
  updateEnvFile,
} from "../src/config/env-file.js";


describe("formatEnvValue", () => {
  // 不自己猜引号规则：写出来的东西交给 Node 自己的解析器读回去
  it("writes values that Node reads back exactly", () => {
    const values = [
      "sk-abc123",
      "sk-has#hash",
      "  spaces around  ",
      "C:\\new\\codex.exe",
      'with "double" quotes',
      "it's",
      "",
    ];

    for (const value of values) {
      expect(parseEnv(`KEY=${formatEnvValue(value)}`)).toEqual({ KEY: value });
    }
  });

  it("refuses values it cannot write safely", () => {
    expect(() => formatEnvValue("line1\nline2")).toThrow("换行");
    expect(() => formatEnvValue("a'b`c")).toThrow();
  });
});


describe("updateEnvFile", () => {
  it("replaces existing keys in place and keeps comments, other keys and CRLF", () => {
    const before = "# DeepSeek\r\nAGENT_BASE_URL=https://old.example\r\nAGENT_THINKING=disabled\r\n";

    const after = updateEnvFile(before, {
      AGENT_BASE_URL: "https://api.deepseek.com",
      AGENT_API_KEY: "sk-new",
    });

    expect(after).toBe(
      "# DeepSeek\r\n"
      + "AGENT_BASE_URL='https://api.deepseek.com'\r\n"
      + "AGENT_THINKING=disabled\r\n"
      + "AGENT_API_KEY='sk-new'\r\n",
    );
  });

  it("removes later duplicates, which would otherwise override the new value", () => {
    const after = updateEnvFile("AGENT_MODEL=a\nexport AGENT_MODEL=b\n", { AGENT_MODEL: "c" });

    expect(after).toBe("AGENT_MODEL='c'\n");
    expect(parseEnv(after)).toEqual({ AGENT_MODEL: "c" });
  });

  it("creates the content of a new file", () => {
    expect(updateEnvFile("", { AGENT_MODEL: "deepseek-flash" })).toBe("AGENT_MODEL='deepseek-flash'\n");
  });

  it("rejects invalid variable names", () => {
    expect(() => updateEnvFile("", { "BAD-NAME": "x" })).toThrow("不合法的变量名");
  });
});