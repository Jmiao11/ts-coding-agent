import { describe, expect, it } from "vitest";

import {
  skillEvalPassed,
  skillTriggerCorrect,
  summarizeSkillEvals,
  summarizeSkillMetrics,
  summarizeSkillAB,
  type SkillEvalObservation,
} from "../src/skills/skill-eval.js";

describe("skill trigger evaluation", () => {
  it.each([
    [null, [], true],
    [null, ["mcp-builder"], false],
    ["mcp-builder", [], false],
    ["mcp-builder", ["mcp-builder"], true],
    ["mcp-builder", ["mcp-builder", "mcp-builder"], true],
    ["mcp-builder", ["frontend-design"], false],
    ["mcp-builder", ["mcp-builder", "frontend-design"], false],
  ])("scores expected=%s actual=%j", (expected, skills, correct) => {
    expect(skillTriggerCorrect(expected, skills)).toBe(correct);
  });

  const observation = (overrides: Partial<SkillEvalObservation> = {}): SkillEvalObservation => ({
    expectSkill: null, skills: [], input: 100, output: 10, exitCode: 0, ...overrides,
  });

  it("does not count a failed or missing CLI run as a correct negative", () => {
    expect(skillEvalPassed(observation({ exitCode: 1 }))).toBe(false);
    expect(skillEvalPassed(observation({ exitCode: null }))).toBe(false);
    expect(skillEvalPassed(observation({ error: "missing-session" }))).toBe(false);
  });

  it("summarizes exact matches, negative cases and mean usage by actual skill reads", () => {
    const summary = summarizeSkillEvals([
      observation({ expectSkill: "mcp-builder", skills: ["mcp-builder"], input: 300, output: 30 }),
      observation({ expectSkill: "mcp-builder", skills: ["mcp-builder", "frontend-design"] }),
      observation({ expectSkill: "frontend-design" }),
      observation(),
      observation({ skills: ["frontend-design"], input: 200, output: 20 }),
      observation({ error: "missing-session" }),
    ]);
    expect(summary).toEqual({
      correct: 2, total: 6,
      expected: { correct: 1, total: 3 },
      unexpected: { correct: 1, total: 3 },
      tokens: {
        withSkill: { runs: 3, input: 200, output: 20, total: 220 },
        withoutSkill: { runs: 3, input: 100, output: 10, total: 110 },
      },
    });
  });

  it("returns null averages for empty groups instead of dividing by zero", () => {
    expect(summarizeSkillEvals([])).toEqual({
      correct: 0, total: 0,
      expected: { correct: 0, total: 0 }, unexpected: { correct: 0, total: 0 },
      tokens: {
        withSkill: { runs: 0, input: null, output: null, total: null },
        withoutSkill: { runs: 0, input: null, output: null, total: null },
      },
    });
  });
});

describe("skill A/B summaries", () => {
  it("averages each case and variant separately without scoring answers", () => {
    const run = { id: "a", noSkills: false, toolCalls: 2, input: 100, output: 20, exitCode: 0 };
    const summary = summarizeSkillAB([
      run,
      { ...run, toolCalls: 4, input: 300, output: 40 },
      { ...run, noSkills: true, toolCalls: 1, input: 80, output: 10 },
      { ...run, noSkills: true, toolCalls: 3, input: 120, output: 30 },
      { ...run, id: "b", input: 900 },
    ]);
    expect(summary).toEqual([
      { id: "a",
        withSkills: { runs: 2, completed: 2, toolCalls: 3, input: 200, output: 30 },
        withoutSkills: { runs: 2, completed: 2, toolCalls: 2, input: 100, output: 20 } },
      { id: "b",
        withSkills: { runs: 1, completed: 1, toolCalls: 2, input: 900, output: 20 },
        withoutSkills: { runs: 0, completed: 0, toolCalls: null, input: null, output: null } },
    ]);
  });

  it("retains failed counts and excludes them from averages", () => {
    const good = { toolCalls: 4, input: 100, output: 20, exitCode: 0 };
    expect(summarizeSkillMetrics([
      good, { ...good, exitCode: 1, input: 0 }, { ...good, error: "missing-session" },
    ])).toEqual({ runs: 3, completed: 1, toolCalls: 4, input: 100, output: 20 });
    expect(summarizeSkillMetrics([{ ...good, exitCode: null }]))
      .toEqual({ runs: 1, completed: 0, toolCalls: null, input: null, output: null });
    expect(summarizeSkillAB([])).toEqual([]);
  });
});
