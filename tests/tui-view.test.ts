import { PassThrough } from "node:stream";

import { format } from "node:util";

import { createPlainView } from "../src/ui/plain-view.js";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { Loader, visibleWidth } from "@earendil-works/pi-tui";

import type {
  Terminal,
} from "@earendil-works/pi-tui";

import {
  createTuiView,
} from "../src/ui/tui-view.js";


/** 假的终端：记录写出去的内容；type() 模拟用户按键 */
class FakeTerminal implements Terminal {
  written = "";
  width = 80;
  stopped = false;
  private onInput: (data: string) => void = () => {};

  start(onInput: (data: string) => void): void {
    this.onInput = onInput;
  }

  stop(): void {
    this.stopped = true;
  }

  async drainInput(): Promise<void> {}

  write(data: string): void {
    this.written += data;
  }

  get columns(): number { return this.width; }
  get rows(): number { return 24; }
  get kittyProtocolActive(): boolean { return false; }

  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
  setProgramStatus(): void {}

  type(data: string): void {
    this.onInput(data);
  }

  /** 屏幕上的文字：去掉控制序列 */
  text(): string {
    return this.written
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
      .replace(/\x1b[_\]][^\x07\x1b]*(\x07|\x1b\\)/g, "");
  }
}

const settle = () => new Promise((resolvePromise) => setTimeout(resolvePromise, 60));


function setup() {
  const terminal = new FakeTerminal();
  const view = createTuiView({ terminal, exitHook: false });
  return { terminal, view };
}


describe("tui view", () => {
  it("fits the complete Chinese shortcut hint into exactly 120 terminal columns", async () => {
    const { terminal, view } = setup();
    terminal.width = 120;
    view.status("中文工作区 · deepseek-flash · sandbox: host · in 16.7k / out 1.4k");
    await settle();
    const bar = terminal.text().split(/\r?\n/).find((line) => line.includes("Enter 发送"));
    expect(bar).toBeDefined();
    expect(bar!.endsWith("Enter 发送 · Ctrl+O 详情 · /help")).toBe(true);
    expect(visibleWidth(bar!)).toBe(120);
    view.close();
  });

  it("preserves plain header bytes and diagnostic ordering", () => {
    const output = new PassThrough();
    let written = "";
    output.on("data", (chunk) => { written += String(chunk); });
    const view = createPlainView({ output });
    const fields = { workspace: "F:\\工作区", model: "model", sandbox: "host（说明）" };
    view.header(fields);
    expect(written).toBe([
      format("workspace:", fields.workspace),
      format("model:", fields.model),
      format("sandbox:", fields.sandbox),
      "",
    ].join("\n"));
    written = "";
    view.header({ ...fields, thinking: "provider default" });
    view.replIntro();
    view.keyHelp();
    expect(written).toBe(`workspace: ${fields.workspace}\nmodel: model\nthinking: provider default\nsandbox: host（说明）\n`
      + "\n交互模式：输入任务后回车运行；/help 查看命令，/exit、Ctrl+C 或 Ctrl+D 退出。任务运行中按 Ctrl+C 只中止当前任务。\n");
  });

  it("renders a compact header and hides the plain REPL introduction", async () => {
    const { terminal, view } = setup();
    view.header({ workspace: "F:\\work", model: "model", sandbox: "host（说明）", thinking: "hidden" });
    view.replIntro();
    view.keyHelp();
    await settle();
    expect(terminal.written).toContain("\x1b[1mTS Coding Agent");
    expect(terminal.text()).toContain("TS Coding Agent · model · sandbox: host");
    expect(terminal.text()).toContain("F:\\work");
    expect(terminal.text()).not.toContain("交互模式");
    expect(terminal.text()).not.toContain("thinking:");
    expect(terminal.text()).toContain("Ctrl+O 展开 / 收起最近一组工具详情");
    view.close();
  });

  it("truncates the left status before the shortcut hint in a narrow terminal", async () => {
    const { terminal, view } = setup();
    terminal.width = 48;
    view.status("agent-harness · deepseek-flash · sandbox: host · in 16.7k / out 1.4k");
    await settle();
    expect(terminal.text()).toContain("Enter 发送 · Ctrl+O 详情 · /help");
    expect(terminal.text()).not.toContain("16.7k");
    view.close();
  });

  it("separates tasks, groups and answers with one blank line", () => {
    const { terminal, view } = setup();
    view.userMessage("task-one");
    view.toolStart("a", "read_file", "a.ts");
    view.toolEnd("a", true);
    view.beginAnswer();
    view.appendAnswer("answer-one");
    view.endAnswer();
    view.userMessage("task-two");
    view.close();
    const rows = terminal.text().split(/\r?\n/).map((line) => line.trim());
    const task = rows.findIndex((line) => line.includes("❯ task-one"));
    const group = rows.findIndex((line) => line.includes("✓ 1 次工具调用"));
    const answer = rows.findIndex((line) => line.includes("● answer-one"));
    const next = rows.findIndex((line) => line.includes("❯ task-two"));
    expect(group - task).toBe(2);
    expect(answer - group).toBe(2);
    expect(next - answer).toBe(2);
  });

  it("only exposes successful output when Ctrl+O expands the latest group", async () => {
    const { terminal, view } = setup();
    view.toolStart("a", "run_command", "echo success");
    view.toolEnd("a", true, "success-detail");
    const input = view.readLine("> ");
    terminal.type("draft");
    await settle();
    expect(terminal.text()).not.toContain("success-detail");
    terminal.type("\x0f");
    await settle();
    expect(terminal.text()).toContain("  ✓ run_command echo success");
    expect(terminal.text()).toContain("    success-detail");
    const offset = terminal.written.length;
    terminal.type("\x0f");
    await settle();
    expect(terminal.written.slice(offset)).not.toContain("success-detail");
    terminal.type("\r");
    expect(await input).toBe("draft");
    view.close();
  });

  it("consumes Ctrl+O during approval without answering and only toggles the newest group", async () => {
    const { terminal, view } = setup();
    view.toolStart("a", "read_file", "old.ts");
    view.toolEnd("a", true, "old-detail");
    view.beginAnswer();
    view.appendAnswer("next");
    view.endAnswer();
    view.toolStart("b", "read_file", "new.ts");
    view.toolEnd("b", true, "new-detail");
    let answered = false;
    const confirmation = view.confirm("允许吗？").then((value) => { answered = true; return value; });
    terminal.type("\x0f");
    await settle();
    expect(answered).toBe(false);
    expect(terminal.text()).toContain("new-detail");
    expect(terminal.text()).not.toContain("old-detail");
    terminal.type("y");
    expect(await confirmation).toBe(true);
    view.toolStart("c", "read_file", "after-approval.ts");
    view.toolEnd("c", true);
    terminal.type("\x0f");
    view.close();
    expect(terminal.text()).toContain("after-approval");
  });

  it("groups successful tools and hides their details", async () => {
    const { terminal, view } = setup();
    view.toolStart("a", "read_file", "README.md");
    await settle();
    expect(terminal.text()).toContain("read_file README.md · 已完成 0 项");
    view.toolEnd("a", true, "secret-success-output");
    view.toolStart("b", "run_command", "pnpm test");
    view.toolEnd("b", true, "successful-test-output");
    view.beginAnswer();
    view.appendAnswer("done");
    view.endAnswer();
    await settle();
    expect(terminal.text()).toContain("✓ 2 次工具调用");
    expect(terminal.text()).not.toContain("secret-success-output");
    expect(terminal.text()).not.toContain("successful-test-output");
    view.close();
  });

  it("always shows failed tools and their first and last eight detail lines", async () => {
    const { terminal, view } = setup();
    const lines = Array.from({ length: 12 }, (_, i) => `failure-row-${i + 1}`);
    lines[0] = "$ pnpm test";
    view.toolStart("a", "read_file", "README.md");
    view.toolStart("b", "run_command", "pnpm test");
    view.toolEnd("b", false, lines.join("\r\n") + "\r\n");
    view.toolEnd("a", true);
    view.toolEnd("a", false);
    view.toolEnd("unknown", true);
    view.beginAnswer();
    await settle();
    expect(terminal.text()).toContain("✗ 2 次工具调用，其中 1 次失败");
    expect(terminal.text()).toContain("  ✗ run_command pnpm test");
    expect(terminal.text()).toContain("    $ pnpm test");
    expect(terminal.text()).toContain("… 省略 3 行");
    expect(terminal.text()).not.toContain("failure-row-2");
    for (const line of lines.slice(-8)) expect(terminal.text()).toContain(line);
    view.close();
  });

  it("starts a new group after an answer and stops every loader on boundaries and close", async () => {
    const stop = vi.spyOn(Loader.prototype, "stop");
    const { terminal, view } = setup();
    try {
      view.toolStart("a", "read_file", "a.ts");
      const calls = stop.mock.calls.length;
      view.toolEnd("a", true);
      view.beginAnswer();
      expect(stop.mock.calls.length).toBe(calls + 1);
      view.appendAnswer("first-answer");
      view.endAnswer();
      view.toolStart("b", "read_file", "b.ts");
      view.toolEnd("b", true);
      const beforeClose = stop.mock.calls.length;
      view.close();
      view.close();
      expect(stop.mock.calls.length).toBe(beforeClose + 1);
      expect(terminal.text().match(/✓ 1 次工具调用/g)).toHaveLength(2);
    } finally {
      view.close();
      stop.mockRestore();
    }
  });

  it("marks the current group aborted when Ctrl+C interrupts a task", async () => {
    const { terminal, view } = setup();
    let interrupts = 0;
    view.onInterrupt(() => { interrupts += 1; });
    view.toolStart("a", "run_command", "long task");
    terminal.type("\x03");
    view.toolEnd("a", false, "aborted");
    await settle();
    expect(interrupts).toBe(1);
    expect(terminal.text()).toContain("■ 已中止 · 已完成 1 项");
    view.close();
  });

  it("renders status and shortcuts on one line below the editor", async () => {
    const { terminal, view } = setup();

    view.status("model · sandbox: host");
    await settle();

    const text = terminal.text();
    expect(text).toContain("model · host");
    expect(text.lastIndexOf("model · host")).toBeGreaterThan(text.lastIndexOf("─"));
    expect(text).toMatch(/model · host[^\r\n]*Enter 发送 · Ctrl\+O 详情 · \/help/);

    const offset = terminal.written.length;
    view.status("model · sandbox: host · in: 10 / out: 2");
    await settle();
    expect(terminal.written.slice(offset)).toContain("in: 10 / out: 2");
    view.close();
  });

  it("flushes final history without the editor borders or status line on close", async () => {
    const { terminal, view } = setup();
    view.status("status-to-remove");
    await settle();
    expect(terminal.text()).toContain("─");

    const offset = terminal.written.length;
    view.info("final-history-line");
    view.close();
    view.close();

    const closingOutput = terminal.written.slice(offset);
    expect(closingOutput).toContain("final-history-line");
    expect(closingOutput).not.toContain("─");
    expect(closingOutput).not.toContain("status-to-remove");
    expect(closingOutput).not.toContain("Enter 发送");
    expect(terminal.stopped).toBe(true);
  });

  it("ignores the CLI-formatted tool output", async () => {
    const { terminal, view } = setup();
    view.toolOutput("run_command", "$ pnpm test\nshould-not-be-shown\nExit code: 0");
    await settle();
    expect(terminal.text()).not.toContain("should-not-be-shown");
    expect(terminal.text()).not.toContain("run_command output");
    view.close();
  });

  it("only renders new diagnostic logs when debug is enabled", async () => {
    const { terminal, view } = setup();

    view.log("hidden-by-default");
    await settle();
    expect(terminal.text()).not.toContain("hidden-by-default");

    view.setDebug(true);
    view.log("[context] est=12 threshold=100");
    await settle();

    expect(terminal.text()).toContain("[context] est=12 threshold=100");
    expect(terminal.written).toContain("\x1b[2m");
    view.setDebug(false);
    view.log("hidden-after-toggle");
    await settle();
    expect(terminal.text()).not.toContain("hidden-after-toggle");
    view.close();
  });

  it("keeps plain logs identical to info regardless of debug", () => {
    const output = new PassThrough();
    let written = "";
    output.on("data", (chunk) => { written += String(chunk); });
    const view = createPlainView({ output });

    view.info("same text");
    view.setDebug(false);
    view.log("same text");
    view.setDebug(true);
    view.log("same text");

    expect(written).toBe("same text\nsame text\nsame text\n");
  });

  it("preserves the plain command-line task format exactly", () => {
    const output = new PassThrough();
    let written = "";
    output.on("data", (chunk) => { written += String(chunk); });
    const view = createPlainView({ output });

    view.userMessage("任务\n第二行");
    expect(written).toBe("task: 任务\n第二行 \n\n");
  });

  it("shows bold command-line tasks and a dim hint below the editor", async () => {
    const { terminal, view } = setup();
    view.userMessage("直接提交的任务");
    await settle();

    expect(terminal.written).toContain("\x1b[1m❯ 直接提交的任务");
    expect(terminal.text()).toContain("Enter 发送 · Ctrl+O 详情 · /help");
    expect(terminal.text().lastIndexOf("─")).toBeLessThan(
      terminal.text().lastIndexOf("Enter 发送"),
    );
    view.close();
  });

  it("renders info lines and a streamed answer into the history above the editor", async () => {
    const { terminal, view } = setup();

    view.info("workspace: /work");
    view.beginAnswer();
    view.appendAnswer("你");
    view.appendAnswer("好");
    view.endAnswer();
    await settle();

    expect(terminal.text()).toContain("workspace: /work");
    expect(terminal.text()).toContain("你好");
    const rows = terminal.text().split(/\r?\n/).map((row) => row.trimEnd());
    const answerIndex = rows.findIndex((row) => row.includes("● 你好"));
    expect(answerIndex).toBeGreaterThan(0);
    expect(rows[answerIndex - 1]).toBe("");
    expect(rows[answerIndex + 1]).toBe("");
    view.close();
  });

  it("reads a line from the editor", async () => {
    const { terminal, view } = setup();

    const line = view.readLine("> ");
    terminal.type("修复测试");
    terminal.type("\r");

    expect(await line).toBe("修复测试");
    await settle();
    expect(terminal.written).toContain("\x1b[1m❯ 修复测试");
    view.close();
  });

  it("answers a confirmation with a single key: only y means yes", async () => {
    const { terminal, view } = setup();

    const yes = view.confirm("允许吗？");
    await settle();
    expect(terminal.text()).toContain("允许吗？ [y/N]");
    terminal.type("y");
    expect(await yes).toBe(true);

    const no = view.confirm("允许吗？");
    terminal.type("\r");
    expect(await no).toBe(false);
    view.close();
  });

  it("turns Ctrl+C into an interrupt while a task runs, and into 'no input' at the prompt", async () => {
    const { terminal, view } = setup();
    let interrupts = 0;
    view.onInterrupt(() => { interrupts += 1; });

    // 任务运行中（没有在等输入）：中止任务
    terminal.type("\x03");
    expect(interrupts).toBe(1);

    // 在提示符处：和普通终端一样，readLine 返回 null（REPL 据此退出）
    const line = view.readLine("> ");
    terminal.type("\x03");
    expect(await line).toBeNull();
    expect(interrupts).toBe(1);

    // 确认问题期间：中止任务，并当作拒绝
    const answer = view.confirm("允许吗？");
    terminal.type("\x03");
    expect(await answer).toBe(false);
    expect(interrupts).toBe(2);
    view.close();
  });

  it("restores the terminal when closed", () => {
    const { terminal, view } = setup();

    view.close();
    view.close();

    expect(terminal.stopped).toBe(true);
  });
});
