import {
  SKILLS_DIRECTORY,
} from "./skill-catalog.js";


/**
 * 这次工具调用是不是「读了某个 skill」？是的话返回 skill 名字，否则返回 undefined。
 * 界面（显示用了哪个 skill）和评测（统计读没读对）都用它，规则只写在这一个地方。
 *
 * 只认 SKILL.md 本身：读 skill 目录下的 reference/ 等文件，说明已经在用这个 skill 了，不再重复计数。
 */
export function skillReadBy(
  toolName: string,
  args: unknown,
): string | undefined {
  if (toolName !== "read_file" || typeof args !== "object" || args === null) {
    return undefined;
  }

  const path = (args as Record<string, unknown>).path;

  if (typeof path !== "string") {
    return undefined;
  }

  // 模型在 Windows 上可能写反斜杠，也可能加 ./ 前缀
  const normalized = path.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
  const prefix = `${SKILLS_DIRECTORY}/`;

  if (!normalized.startsWith(prefix)) {
    return undefined;
  }

  const match = /^([^/]+)\/SKILL\.md$/.exec(normalized.slice(prefix.length));

  return match?.[1];
}