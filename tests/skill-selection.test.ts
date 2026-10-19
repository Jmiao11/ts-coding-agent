import { afterEach, expect, it, vi } from "vitest";

import * as catalog from "../src/skills/skill-catalog.js";
import { loadEnabledSkills } from "../src/skills/skill-selection.js";
import { createCodingSystemPrompt } from "../src/prompts/coding-system-prompt.js";

afterEach(() => { vi.restoreAllMocks(); });

it("does not scan skills and produces exactly the no-skills prompt when disabled", async () => {
  const scan = vi.spyOn(catalog, "loadSkillCatalog").mockRejectedValue(new Error("must not scan"));
  const selected = await loadEnabledSkills("/work", true);
  expect(selected).toEqual({ skills: [], warnings: [] });
  expect(scan).not.toHaveBeenCalled();
  expect(createCodingSystemPrompt("/work", { skills: selected.skills }))
    .toBe(createCodingSystemPrompt("/work"));
});

it("keeps the normal catalog and warnings when not disabled", async () => {
  const expected = { skills: [{ name: "a", description: "x", path: ".agent/skills/a/SKILL.md" }], warnings: ["warning"] };
  const scan = vi.spyOn(catalog, "loadSkillCatalog").mockResolvedValue(expected);
  expect(await loadEnabledSkills("/work")).toBe(expected);
  expect(scan).toHaveBeenCalledWith("/work");
});
