import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

function assertInside(parent: string, target: string): void {
  const path = relative(parent, target);
  if (!path || path === ".." || path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(path)) {
    throw new Error(`Refusing to remove a path outside ${parent}`);
  }
}

/** 只改变临时 worktree；主工作区的 dist、依赖和 skills 不受影响。 */
export async function withSkillFreeWorktree<T>(workspace: string, run: (root: string) => Promise<T>): Promise<T> {
  const temporaryRoot = realpathSync(tmpdir());
  if (/[^\x00-\x7f]/.test(temporaryRoot)) throw new Error("Skill evaluation requires an ASCII TEMP/TMP directory");
  const parent = mkdtempSync(join(temporaryRoot, "agent-skill-ab-"));
  const checkout = resolve(parent, "workspace");
  const git = (args: string[]) => execFileSync("git", ["-C", workspace, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  try {
    git(["worktree", "add", "--detach", checkout, "HEAD"]);
    const skills = join(checkout, ".agent", "skills");
    if (existsSync(skills)) {
      assertInside(realpathSync(checkout), realpathSync(skills));
      rmSync(skills, { recursive: true, force: true });
    }
    return await run(checkout);
  } finally {
    // 即使 add 部分失败，也查询 Git 的登记，不能只看目录是否存在。
    const registered = git(["worktree", "list", "--porcelain", "-z"]).split("\0")
      .filter((entry) => entry.startsWith("worktree "))
      .some((entry) => {
        const path = resolve(entry.slice("worktree ".length));
        return process.platform === "win32" ? path.toLowerCase() === checkout.toLowerCase() : path === checkout;
      });
    if (registered) git(["worktree", "remove", "--force", checkout]);
    assertInside(temporaryRoot, resolve(parent));
    rmSync(parent, { recursive: true, force: true });
  }
}
