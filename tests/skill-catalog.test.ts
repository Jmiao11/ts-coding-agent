import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  loadSkillCatalog,
  parseFrontmatter,
} from "../src/skills/skill-catalog.js";


describe("parseFrontmatter", () => {
  it("reads single-line key: value pairs between --- lines, with CRLF and a BOM", () => {
    expect(
      parseFrontmatter("\uFEFF---\r\nname: repo-overview\r\ndescription: \"快速了解一个仓库\"\r\n---\r\n# 正文\r\n"),
    ).toEqual({
      name: "repo-overview",
      description: "快速了解一个仓库",
    });
  });

  it("refuses what it does not understand instead of guessing", () => {
    // 没有 frontmatter
    expect(parseFrontmatter("# 只有正文\n")).toBeUndefined();
    // 没有结束的 ---
    expect(parseFrontmatter("---\nname: a\n")).toBeUndefined();
    // YAML 多行值
    expect(parseFrontmatter("---\nname: a\ndescription: >\n  第一行\n---\n")).toBeUndefined();
  });
});


describe("loadSkillCatalog", () => {
  let workspace: string;

  async function addSkill(directory: string, content: string): Promise<void> {
    const path = join(workspace, ".agent", "skills", directory);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "SKILL.md"), content, "utf8");
  }

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "agent-skills-"));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("returns nothing when the workspace has no skills directory", async () => {
    expect(await loadSkillCatalog(workspace)).toEqual({ skills: [], warnings: [] });
  });

  it("lists valid skills sorted by name, with workspace-relative paths", async () => {
    await addSkill("run-tests", "---\nname: run-tests\ndescription: 怎样运行和定位失败的测试\n---\n正文\n");
    await addSkill("repo-overview", "---\nname: repo-overview\ndescription: 快速了解一个仓库\n---\n正文\n");

    expect(await loadSkillCatalog(workspace)).toEqual({
      skills: [
        { name: "repo-overview", description: "快速了解一个仓库", path: ".agent/skills/repo-overview/SKILL.md" },
        { name: "run-tests", description: "怎样运行和定位失败的测试", path: ".agent/skills/run-tests/SKILL.md" },
      ],
      warnings: [],
    });
  });

  it("skips broken skills with a warning, and keeps the good ones", async () => {
    await addSkill("good", "---\nname: good\ndescription: 好的\n---\n");
    await addSkill("no-frontmatter", "# 忘了写 frontmatter\n");
    await addSkill("wrong-name", "---\nname: other-name\ndescription: x\n---\n");
    await addSkill("no-description", "---\nname: no-description\n---\n");
    await addSkill("Bad_Name", "---\nname: Bad_Name\ndescription: x\n---\n");
    await addSkill("too-long", `---\nname: too-long\ndescription: ${"x".repeat(1025)}\n---\n`);
    await mkdir(join(workspace, ".agent", "skills", "empty"), { recursive: true });

    const catalog = await loadSkillCatalog(workspace);

    expect(catalog.skills.map((skill) => skill.name)).toEqual(["good"]);
    expect(catalog.warnings).toHaveLength(6);

    for (const directory of ["no-frontmatter", "wrong-name", "no-description", "Bad_Name", "too-long", "empty"]) {
      expect(catalog.warnings.some((warning) => warning.includes(`.agent/skills/${directory}/SKILL.md`))).toBe(true);
    }
  });
});
