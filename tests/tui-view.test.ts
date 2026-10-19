import { PassThrough } from "node:stream";

import { createPlainView } from "../src/ui/plain-view.js";

import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  Terminal,
} from "@earendil-works/pi-tui";

import {
  createTuiView,
} from "../src/ui/tui-view.js";


/** 假的终端：记录写出去的内容；type() 模拟用户按键 */
class FakeTerminal implements Terminal {
  written = "";
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

  get columns(): number { return 80; }
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
  it("shows a tool as running, then marks it done in place", async () => {
    const { terminal, view } = setup();

    view.toolStart("a", "read_file", "README.md");
    await settle();
    expect(terminal.text()).toContain("⋯ read_file README.md");

    view.toolEnd("a", true);
    await settle();
    expect(terminal.text()).toContain("✓ read_file README.md");
    view.close();
  });

  it("matches interleaved completions by id and ignores unknown or repeated ends", async () => {
    const { terminal, view } = setup();

    view.toolStart("a", "read_file", "README.md");
    view.toolStart("b", "run_command", "pnpm test");
    view.toolEnd("b", false);
    view.toolEnd("a", true);
    view.toolEnd("a", false);
    view.toolEnd("unknown", true);
    await settle();

    expect(terminal.text()).toContain("✓ read_file README.md");
    expect(terminal.text()).toContain("✗ run_command pnpm test");
    expect(terminal.text()).not.toContain("⋯");
    view.close();
  });

  it("renders a replaceable status line above the editor", async () => {
    const { terminal, view } = setup();

    view.status("model · sandbox: host");
    await settle();

    const text = terminal.text();
    expect(text).toContain("model · sandbox: host");
    expect(text.indexOf("model · sandbox: host")).toBeLessThan(text.indexOf("─"));

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
    expect(terminal.written).toContain("\x1b[2mEnter 发送 · Ctrl+C 中止 · /help");
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
    const answerIndex = rows.indexOf("你好");
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
