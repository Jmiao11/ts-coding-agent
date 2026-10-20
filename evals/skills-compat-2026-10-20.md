# anthropics/skills 加载兼容性检查

在 Windows 上先运行 `pnpm build`，再用本机 `F:\skills-src` 检查。脚本把 `skills/*` 复制到临时工作区的 `.agent/skills/`，调用构建产物中的 `loadSkillCatalog`，结束后删除临时目录。

```powershell
git -C F:\skills-src rev-parse HEAD
node scripts/check-skill-compat.mjs F:\skills-src
```

```text
git -C F:\skills-src rev-parse HEAD
dbd4588f9e1033efb41dad4bef2f7947c8993d44

node scripts/check-skill-compat.mjs F:\skills-src
Loaded 18/19 skills:
  academy-guide
  algorithmic-art
  brand-guidelines
  canvas-design
  discernment-nudge
  doc-coauthoring
  docx
  frontend-design
  internal-comms
  mcp-builder
  pdf
  pptx
  skill-creator
  slack-gif-creator
  theme-factory
  web-artifacts-builder
  webapp-testing
  xlsx
Warnings (1):
  跳过 skill .agent/skills/claude-api/SKILL.md：description 超过 1024 个字符
```

这里只检查目录扫描和 frontmatter 校验，不代表这些 Skill 在模型任务中都会被触发或改善回答。
