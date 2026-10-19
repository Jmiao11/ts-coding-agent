import {
  readdir,
  readFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";


/** skill 放在工作区的这个目录下，每个 skill 一个子目录，里面是 SKILL.md */
export const SKILLS_DIRECTORY = ".agent/skills";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;


export type SkillEntry = {
  name: string;
  description: string;

  /** 相对于工作区的路径（用 /），模型用 read_file 读它 */
  path: string;
};


export type SkillCatalog = {
  skills: SkillEntry[];

  /** 格式不对、被跳过的 skill：启动时告诉用户，但不阻止启动 */
  warnings: string[];
};


/**
 * 解析开头的 frontmatter：
 *
 *   ---
 *   name: repo-overview
 *   description: 一行说明
 *   ---
 *
 * 只支持单行的 `key: value`。遇到不认识的写法（比如 YAML 的多行值）返回 undefined，
 * 而不是猜着解析：解析错了比报错更难发现。
 */
export function parseFrontmatter(
  text: string,
): Record<string, string> | undefined {
  // Windows 上的编辑器常常加 BOM、用 CRLF 换行
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  if (lines[0]?.trim() !== "---") {
    return undefined;
  }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");

  if (end === -1) {
    return undefined;
  }

  const fields: Record<string, string> = {};

  for (const line of lines.slice(1, end)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);

    if (!match) {
      return undefined;
    }

    const key = match[1]!;
    let value = match[2]!.trim();

    if (value === "|" || value === ">" || value.startsWith("|-") || value.startsWith(">-")) {
      return undefined;
    }

    // 允许用一对引号把值括起来
    if (value.length >= 2 && (value[0] === "\"" || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }

    fields[key] = value;
  }

  return fields;
}


/** 检查一个 skill 的 frontmatter，返回问题描述；没问题返回 undefined */
function checkSkill(
  directoryName: string,
  fields: Record<string, string>,
): string | undefined {
  const name = fields.name ?? "";
  const description = fields.description ?? "";

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > MAX_NAME_LENGTH) {
    return `name 必须是小写字母、数字和连字符（最多 ${MAX_NAME_LENGTH} 个字符），实际是 "${name}"`;
  }

  if (name !== directoryName) {
    return `name "${name}" 和目录名 "${directoryName}" 不一致`;
  }

  if (description.trim() === "") {
    return "缺少 description";
  }

  // description 会放进 system prompt：限制长度，免得一个 skill 占掉大量上下文
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `description 超过 ${MAX_DESCRIPTION_LENGTH} 个字符`;
  }

  return undefined;
}


/**
 * 扫描工作区里的 skill，只读每个 SKILL.md 的 frontmatter。
 * 正文不在这里读：模型需要时自己用 read_file 读（渐进式披露）。
 * 格式不对的 skill 跳过并给出警告，不会让启动失败。
 */
export async function loadSkillCatalog(
  workspaceRoot: string,
): Promise<SkillCatalog> {
  const root = join(workspaceRoot, SKILLS_DIRECTORY);

  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    // 没有 skill 目录是正常情况
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { skills: [], warnings: [] };
    }

    throw error;
  }

  const skills: SkillEntry[] = [];
  const warnings: string[] = [];

  // 不跟随符号链接（isDirectory() 对符号链接返回 false）：skill 必须真的在工作区里
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const path = `${SKILLS_DIRECTORY}/${entry.name}/SKILL.md`;

    let text: string;

    try {
      text = await readFile(join(root, entry.name, "SKILL.md"), "utf8");
    } catch {
      warnings.push(`跳过 skill ${path}：文件不存在或无法读取`);
      continue;
    }

    const fields = parseFrontmatter(text);

    if (!fields) {
      warnings.push(`跳过 skill ${path}：开头没有可识别的 frontmatter（--- 包围的 name / description）`);
      continue;
    }

    const problem = checkSkill(entry.name, fields);

    if (problem) {
      warnings.push(`跳过 skill ${path}：${problem}`);
      continue;
    }

    skills.push({
      name: fields.name!,
      description: fields.description!.replace(/\s+/g, " ").trim(),
      path,
    });
  }

  // readdir 的顺序取决于文件系统：排好序，system prompt 每次才一样（也利于 prompt 缓存）
  skills.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  warnings.sort();

  return { skills, warnings };
}