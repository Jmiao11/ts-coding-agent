import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createCodingSystemPrompt,
} from "../src/prompts/coding-system-prompt.js";


describe("coding system prompt", () => {
  it("says nothing about a sandbox when commands run on the host", () => {
    expect(createCodingSystemPrompt("/work")).not.toMatch(/sandbox/i);
    expect(createCodingSystemPrompt("/work", { sandbox: "host" })).not.toMatch(/sandbox/i);
  });

  it("tells the model that sandbox errors are not facts about the workspace", () => {
    const prompt = createCodingSystemPrompt("/work", { sandbox: "mxc" });

    // 实测：ping 失败后模型建议 netsh winsock reset；dir src 失败后断定 src 不存在、要重新创建
    expect(prompt).toContain("run_command runs commands in a restricted sandbox (mxc)");
    expect(prompt).toContain("check with list_directory or read_file");
    expect(prompt).toContain("Never suggest changing system or network settings");
  });
});