import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { loadSkillCatalog } from "../dist/skills/skill-catalog.js";

if (process.argv.length !== 3) {
  console.error("Usage: node scripts/check-skill-compat.mjs <skills repository directory>");
  process.exit(1);
}

const source = resolve(process.argv[2], "skills");
const directories = (await readdir(source, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const workspace = await mkdtemp(join(tmpdir(), "agent-harness-skills-"));

try {
  const destination = join(workspace, ".agent", "skills");
  await mkdir(destination, { recursive: true });
  for (const name of directories) {
    await cp(join(source, name), join(destination, name), { recursive: true });
  }
  const { skills, warnings } = await loadSkillCatalog(workspace);
  console.log(`Loaded ${skills.length}/${directories.length} skills:`);
  for (const skill of skills) console.log(`  ${skill.name}`);
  console.log(`Warnings (${warnings.length}):`);
  for (const warning of warnings) console.log(`  ${warning}`);
} finally {
  if (dirname(workspace) !== resolve(tmpdir()) || !basename(workspace).startsWith("agent-harness-skills-")) {
    throw new Error(`Refusing to remove unexpected temporary directory: ${workspace}`);
  }
  await rm(workspace, { recursive: true, force: true });
}
