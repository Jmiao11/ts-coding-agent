import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import { withSkillFreeWorktree } from "../src/skills/skill-eval-worktree.js";

let workspace: string;
const git = (args: string[]) => execFileSync("git", ["-C", workspace, ...args], { encoding: "utf8", stdio: "pipe" });

beforeEach(() => {
  workspace = mkdtempSync(join(realpathSync(tmpdir()), "agent-skill-worktree-test-"));
  git(["init"]);
  mkdirSync(join(workspace, ".agent", "skills", "example"), { recursive: true });
  writeFileSync(join(workspace, ".agent", "skills", "example", "SKILL.md"), "fixture");
  git(["add", "."]);
  git(["-c", "user.name=Skill Eval Test", "-c", "user.email=skill-eval@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "fixture"]);
});

afterEach(() => {
  expect(relative(realpathSync(tmpdir()), realpathSync(workspace))).toMatch(/^agent-skill-worktree-test-/);
  rmSync(workspace, { recursive: true, force: true });
});

it.each([false, true])("removes skills only in the worktree and cleans up when callback throws=%s", async (fail) => {
  let checkout = "";
  const run = withSkillFreeWorktree(workspace, async (root) => {
    checkout = root;
    expect(root).toMatch(/^[\x00-\x7f]+$/);
    expect(existsSync(join(root, ".git"))).toBe(true);
    expect(existsSync(join(root, ".agent", "skills"))).toBe(false);
    expect(readFileSync(join(workspace, ".agent", "skills", "example", "SKILL.md"), "utf8")).toBe("fixture");
    if (fail) throw new Error("callback failed");
    return 42;
  });
  if (fail) await expect(run).rejects.toThrow("callback failed");
  else await expect(run).resolves.toBe(42);
  expect(existsSync(dirname(checkout))).toBe(false);
  expect(git(["worktree", "list", "--porcelain"]).match(/^worktree /gm)).toHaveLength(1);
});
