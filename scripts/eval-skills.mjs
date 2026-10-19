// Node 24；先 pnpm build。一次性 CLI 的 stdin 关闭时，PlainView.confirm 立即返回 false：
// 白名单外的命令会被审批扩展拒绝并作为工具结果交回模型，不会等待输入；pnpm typecheck 在白名单内。
// 保留默认审批，不解析 CLI 输出。每次启动独立进程和新会话，统计主会话中提出的工具调用。
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { getSessionDir, listSessions, loadSession, rebuildSession } from "../dist/session/session-store.js";
import { skillReadBy } from "../dist/skills/skill-usage.js";
import { skillEvalPassed, summarizeSkillEvals } from "../dist/skills/skill-eval.js";

const { values } = parseArgs({ options: {
  workspace: { type: "string" }, repeat: { type: "string", default: "2" }, only: { type: "string" },
} });
const repeat = Number(values.repeat);
if (!Number.isSafeInteger(repeat) || repeat < 1) throw new Error("--repeat must be a positive integer");
const workspace = resolve(values.workspace ?? process.cwd());
const allCases = JSON.parse(readFileSync(new URL("../evals/skills.json", import.meta.url), "utf8"));
const cases = values.only ? allCases.filter((item) => item.id === values.only) : allCases;
if (cases.length === 0) throw new Error(`Unknown --only id: ${values.only}`);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const sessionDir = getSessionDir(workspace);
const startedAt = new Date().toISOString();
const resultsDir = fileURLToPath(new URL("../evals/results/", import.meta.url));
mkdirSync(resultsDir, { recursive: true });
const resultsPath = resolve(resultsDir, `${startedAt.replace(/[:.]/g, "-")}.json`);
const results = [];
const save = () => writeFileSync(resultsPath, JSON.stringify({
  startedAt, workspace, repeat, results, summary: summarizeSkillEvals(results),
}, null, 2) + "\n");
writeFileSync(resultsPath, "{}\n", { flag: "wx" });

function runCli(prompt) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cli, "--workspace", workspace, prompt], {
      cwd: workspace, stdio: ["ignore", "ignore", "ignore"], windowsHide: true,
    });
    child.once("error", (error) => resolveRun({ exitCode: null, error: `spawn-${error.code ?? "error"}` }));
    child.once("exit", (exitCode, signal) => resolveRun({ exitCode, ...(signal ? { error: `signal-${signal}` } : {}) }));
  });
}

for (const item of cases) {
  for (let iteration = 1; iteration <= repeat; iteration += 1) {
    const before = new Set(listSessions(sessionDir).map((session) => session.path));
    const outcome = await runCli(item.prompt);
    const result = {
      id: item.id, iteration, expectSkill: item.expectSkill, skills: [], toolCalls: 0,
      input: 0, output: 0, ...outcome,
    };
    try {
      const created = listSessions(sessionDir).filter((session) => !before.has(session.path)
        && session.firstUserText === item.prompt);
      if (created.length !== 1) throw new Error(`new-session-count-${created.length}`);
      const session = loadSession(created[0].path);
      if (session.skippedLines > 0) throw new Error("incomplete-session");
      result.session = session.path;
      const { messages } = rebuildSession(session.entries);
      if (!messages.some((message) => message.role === "assistant")) throw new Error("no-assistant-messages");
      const skills = new Set();
      for (const message of messages) {
        if (message.role !== "assistant") continue;
        result.model ??= message.model;
        result.input += message.usage?.input ?? 0;
        result.output += message.usage?.output ?? 0;
        if (message.stopReason === "error" || message.stopReason === "aborted") result.error = `assistant-${message.stopReason}`;
        for (const content of message.content) {
          if (content.type !== "toolCall") continue;
          result.toolCalls += 1;
          const skill = skillReadBy(content.name, content.arguments);
          if (skill !== undefined) skills.add(skill);
        }
      }
      for (const entry of session.entries) {
        if (entry.type !== "compaction") continue;
        result.input += entry.usage?.input ?? 0;
        result.output += entry.usage?.output ?? 0;
      }
      result.skills = [...skills].sort();
    } catch (error) {
      result.error = error.message;
    }
    result.correct = skillEvalPassed(result);
    results.push(result);
    save();
    console.log(`${result.id} #${iteration} | skills: ${result.skills.join(", ") || "(none)"}`
      + ` | ${result.correct ? "对" : "错"} | tools: ${result.toolCalls} | in ${result.input} / out ${result.output}`
      + (result.error ? ` | error: ${result.error}` : result.exitCode !== 0 ? ` | exit: ${result.exitCode}` : ""));
  }
}

const summary = summarizeSkillEvals(results);
console.log(`触发正确 ${summary.correct}/${summary.total}`);
console.log(`该读时读到 ${summary.expected.correct}/${summary.expected.total}`);
console.log(`不该读时没读 ${summary.unexpected.correct}/${summary.unexpected.total}`);
for (const [label, group] of [["读了 skill", summary.tokens.withSkill], ["没读 skill", summary.tokens.withoutSkill]]) {
  const mean = (number) => number === null ? "n/a" : number.toFixed(1);
  console.log(`平均 tokens（${label}，${group.runs} 次）：in ${mean(group.input)} / out ${mean(group.output)} / total ${mean(group.total)}`);
}
console.log(`结果：${resultsPath}`);
process.exitCode = summary.correct === summary.total ? 0 : 1;
