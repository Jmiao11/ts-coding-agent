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
import { skillEvalPassed, summarizeSkillEvals, summarizeSkillMetrics, summarizeSkillAB } from "../dist/skills/skill-eval.js";

const { values } = parseArgs({ options: {
  workspace: { type: "string" }, repeat: { type: "string", default: "2" }, only: { type: "string" },
  "no-skills": { type: "boolean", default: false }, ab: { type: "boolean", default: false },
} });
const repeat = Number(values.repeat);
if (!Number.isSafeInteger(repeat) || repeat < 1) throw new Error("--repeat must be a positive integer");
if (values.ab && values["no-skills"]) throw new Error("--ab and --no-skills cannot be combined");
const workspace = resolve(values.workspace ?? process.cwd());
const allCases = JSON.parse(readFileSync(new URL("../evals/skills.json", import.meta.url), "utf8"));
const ids = values.only === undefined ? null : values.only.split(",").map((id) => id.trim());
for (const id of ids ?? []) {
  if (!allCases.some((item) => item.id === id)) throw new Error(`Unknown --only id: ${id}`);
}
const cases = allCases.filter((item) => (!ids || ids.includes(item.id)) && (!values.ab || item.expectSkill !== null));
if (cases.length === 0) throw new Error("No eligible cases selected");
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const sessionDir = getSessionDir(workspace);
const startedAt = new Date().toISOString();
const resultsDir = fileURLToPath(new URL("../evals/results/", import.meta.url));
mkdirSync(resultsDir, { recursive: true });
const stamp = startedAt.replace(/[:.]/g, "-");
const mode = values.ab ? "ab" : values["no-skills"] ? "no-skills" : "trigger";
const resultsPath = resolve(resultsDir, `${stamp}${mode === "trigger" ? "" : "-" + mode}.json`);
const answersPath = resolve(resultsDir, `${stamp}-ab.md`);
const results = [];
const summarize = () => values.ab ? summarizeSkillAB(results)
  : values["no-skills"] ? summarizeSkillMetrics(results) : summarizeSkillEvals(results);
const cell = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll("|", "&#124;").replace(/\r?\n/g, "<br>");
function save() {
  writeFileSync(resultsPath, JSON.stringify({ startedAt, workspace, repeat, mode, results, summary: summarize() }, null, 2) + "\n");
  if (!values.ab) return;
  const markdown = ["# Skill A/B：最终回答", "", "每次运行都是独立的新会话；奇数轮先有 skill，偶数轮先无 skill。不让模型打分。", ""];
  for (const item of cases) {
    markdown.push(`## ${item.id}`, "", item.prompt, "", "| 轮次 | 有 skill | 无 skill |", "| --- | --- | --- |");
    for (let iteration = 1; iteration <= repeat; iteration += 1) {
      const answer = (noSkills) => {
        const result = results.find((entry) => entry.id === item.id && entry.iteration === iteration && entry.noSkills === noSkills);
        if (!result) return "（未运行）";
        const status = result.error || result.exitCode !== 0 ? `运行失败（${result.error ?? result.exitCode}）\n` : "";
        return cell(status + (result.answer || "（最终 assistant 消息没有文字）"));
      };
      markdown.push(`| ${iteration} | ${answer(false)} | ${answer(true)} |`);
    }
    markdown.push("");
  }
  writeFileSync(answersPath, markdown.join("\n") + "\n");
}
writeFileSync(resultsPath, "{}\n", { flag: "wx" });

function runCli(prompt, noSkills) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cli, "--workspace", workspace, ...(noSkills ? ["--no-skills"] : []), prompt], {
      cwd: workspace, stdio: ["ignore", "ignore", "ignore"], windowsHide: true,
    });
    child.once("error", (error) => resolveRun({ exitCode: null, error: `spawn-${error.code ?? "error"}` }));
    child.once("exit", (exitCode, signal) => resolveRun({ exitCode, ...(signal ? { error: `signal-${signal}` } : {}) }));
  });
}

async function runCase(item, iteration, noSkills) {
  const before = new Set(listSessions(sessionDir).map((session) => session.path));
  const outcome = await runCli(item.prompt, noSkills);
  const result = {
    id: item.id, iteration, noSkills, expectSkill: item.expectSkill, skills: [], toolCalls: 0,
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
    if (values.ab) {
      const last = messages.findLast((message) => message.role === "assistant");
      result.answer = last.content.filter((content) => content.type === "text").map((content) => content.text).join("");
    }
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
  if (!values.ab && !values["no-skills"]) result.correct = skillEvalPassed(result);
  results.push(result);
  save();
  return result;
}

const mean = (number) => number === null ? "n/a" : number.toFixed(1);
const metrics = (group) => `tools ${mean(group.toolCalls)} | in ${mean(group.input)} / out ${mean(group.output)}`
  + ` (${group.completed}/${group.runs} 完成)`;
for (const item of cases) {
  for (let iteration = 1; iteration <= repeat; iteration += 1) {
    // 对调先后顺序，避免每轮都固定先运行同一边。
    const variants = values.ab ? (iteration % 2 === 1 ? [false, true] : [true, false]) : [values["no-skills"]];
    for (const noSkills of variants) {
      const result = await runCase(item, iteration, noSkills);
      if (values.ab) continue;
      console.log(`${result.id} #${iteration}`
        + (values["no-skills"] ? " | no-skills" : ` | skills: ${result.skills.join(", ") || "(none)"} | ${result.correct ? "对" : "错"}`)
        + ` | tools: ${result.toolCalls} | in ${result.input} / out ${result.output}`
        + (result.error ? ` | error: ${result.error}` : result.exitCode !== 0 ? ` | exit: ${result.exitCode}` : ""));
    }
  }
  if (values.ab) {
    const group = summarizeSkillAB(results).find((entry) => entry.id === item.id);
    console.log(`${item.id} | 有 skill: ${metrics(group.withSkills)} | 无 skill: ${metrics(group.withoutSkills)}`);
  }
}

const summary = summarize();
if (values.ab) {
  console.log(`回答对比：${answersPath}`);
} else if (values["no-skills"]) {
  console.log(`平均（no-skills）：${metrics(summary)}`);
} else {
  console.log(`触发正确 ${summary.correct}/${summary.total}`);
  console.log(`该读时读到 ${summary.expected.correct}/${summary.expected.total}`);
  console.log(`不该读时没读 ${summary.unexpected.correct}/${summary.unexpected.total}`);
  for (const [label, group] of [["读了 skill", summary.tokens.withSkill], ["没读 skill", summary.tokens.withoutSkill]]) {
    console.log(`平均 tokens（${label}，${group.runs} 次）：in ${mean(group.input)} / out ${mean(group.output)} / total ${mean(group.total)}`);
  }
}
console.log(`结果：${resultsPath}`);
process.exitCode = (values.ab || values["no-skills"])
  ? (results.every((result) => result.exitCode === 0 && !result.error) ? 0 : 1)
  : (summary.correct === summary.total ? 0 : 1);
