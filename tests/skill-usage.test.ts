import {
  describe,
  expect,
  it,
} from "vitest";

import {
  skillReadBy,
} from "../src/skills/skill-usage.js";


describe("skillReadBy", () => {
  it("recognizes read_file of a skill's SKILL.md, however the model spells the path", () => {
    expect(skillReadBy("read_file", { path: ".agent/skills/mcp-builder/SKILL.md" })).toBe("mcp-builder");
    expect(skillReadBy("read_file", { path: ".agent\\skills\\mcp-builder\\SKILL.md" })).toBe("mcp-builder");
    expect(skillReadBy("read_file", { path: "./.agent/skills/frontend-design/SKILL.md" })).toBe("frontend-design");
  });

  it("does not count other files, other tools, or odd arguments", () => {
    // skill 自己的参考资料：已经在用这个 skill 了，不重复计数
    expect(skillReadBy("read_file", { path: ".agent/skills/mcp-builder/reference/node_mcp_server.md" })).toBeUndefined();
    expect(skillReadBy("read_file", { path: "README.md" })).toBeUndefined();
    expect(skillReadBy("search_text", { path: ".agent/skills/mcp-builder/SKILL.md" })).toBeUndefined();
    expect(skillReadBy("read_file", null)).toBeUndefined();
  });
});