import { loadSkillCatalog, type SkillCatalog } from "./skill-catalog.js";

/** 禁用时不扫描磁盘，也不产生目录警告或提示词条目。 */
export async function loadEnabledSkills(workspaceRoot: string, noSkills = false): Promise<SkillCatalog> {
  return noSkills ? { skills: [], warnings: [] } : loadSkillCatalog(workspaceRoot);
}
