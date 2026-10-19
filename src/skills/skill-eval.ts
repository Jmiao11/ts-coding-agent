export type SkillEvalObservation = {
  expectSkill: string | null;
  skills: string[];
  input: number;
  output: number;
  exitCode: number | null;
  error?: string;
};

/** 只读到目标 skill 才算命中；重复读取同一个 skill 不改变判定。 */
export function skillTriggerCorrect(expectSkill: string | null, skills: string[]): boolean {
  const unique = new Set(skills);
  return expectSkill === null ? unique.size === 0 : unique.size === 1 && unique.has(expectSkill);
}

export function skillEvalPassed(result: SkillEvalObservation): boolean {
  return result.exitCode === 0 && result.error === undefined
    && skillTriggerCorrect(result.expectSkill, result.skills);
}

export function summarizeSkillEvals(results: SkillEvalObservation[]) {
  const expected = results.filter((result) => result.expectSkill !== null);
  const unexpected = results.filter((result) => result.expectSkill === null);
  const correct = (items: SkillEvalObservation[]) => items.filter(skillEvalPassed).length;
  const average = (items: SkillEvalObservation[]) => ({
    runs: items.length,
    input: items.length ? items.reduce((sum, item) => sum + item.input, 0) / items.length : null,
    output: items.length ? items.reduce((sum, item) => sum + item.output, 0) / items.length : null,
    total: items.length ? items.reduce((sum, item) => sum + item.input + item.output, 0) / items.length : null,
  });

  return {
    correct: correct(results),
    total: results.length,
    expected: { correct: correct(expected), total: expected.length },
    unexpected: { correct: correct(unexpected), total: unexpected.length },
    tokens: {
      withSkill: average(results.filter((result) => result.skills.length > 0)),
      withoutSkill: average(results.filter((result) => result.skills.length === 0)),
    },
  };
}
