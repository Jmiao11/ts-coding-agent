import {
  EventEmitter,
} from "node:events";

import {
  PassThrough,
} from "node:stream";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createPlainView,
} from "../src/ui/plain-view.js";


/** 假的终端：输入流由测试写入，输出流的内容收集起来检查 */
function fakeTerminal(interactive = true) {
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let written = "";
  let errors = "";

  output.on("data", (chunk) => { written += String(chunk); });
  errorOutput.on("data", (chunk) => { errors += String(chunk); });

  const view = createPlainView({ input, output, errorOutput, interactive });

  return {
    view,
    input,
    written: () => written,
    errors: () => errors,
  };
}


describe("plain view", () => {
  it("writes logs exactly like info, including whitespace", () => {
    const { view, written, errors } = fakeTerminal();
    const text = "\n[context] est=12 threshold=100\n";

    view.info(text);
    view.log(text);

    expect(written()).toBe(`${text}\n${text}\n`);
    expect(errors()).toBe("");
  });

  it("writes info to stdout and warnings to stderr, one line each", () => {
    const { view, written, errors } = fakeTerminal();

    view.info("workspace: /work");
    view.warn("⚠ 工作区有未提交的改动");

    expect(written()).toBe("workspace: /work\n");
    expect(errors()).toBe("⚠ 工作区有未提交的改动\n");
  });

  it("asks a yes/no question and only accepts y", async () => {
    const { view, input, written } = fakeTerminal();

    const yes = view.confirm("允许吗？");
    input.write("y\n");
    expect(await yes).toBe(true);
    expect(written()).toContain("允许吗？ [y/N] ");

    const no = view.confirm("允许吗？");
    input.write("\n");
    expect(await no).toBe(false);
  });

  it("refuses without asking when nobody can answer", async () => {
    const { view, written } = fakeTerminal(false);

    expect(await view.confirm("允许吗？")).toBe(false);
    expect(written()).toBe("");
  });

  it("reads a line, and returns null when the input is closed (Ctrl+D)", async () => {
    const { view, input } = fakeTerminal();

    const line = view.readLine("> ");
    input.write("修复测试\n");
    expect(await line).toBe("修复测试");

    const closed = view.readLine("> ");
    input.end();
    expect(await closed).toBeNull();
  });

  it("streams an answer in the same format as the complete answer", () => {
    const { view, written } = fakeTerminal();

    view.beginAnswer();
    view.appendAnswer("你");
    view.appendAnswer("好");
    view.endAnswer();

    expect(written()).toBe("\n[assistant] 你好\n\n");
  });
});


describe("plain view interrupts", () => {
  it("hands Ctrl+C (SIGINT) to the registered handler", () => {
    const signals = new EventEmitter();
    const view = createPlainView({
      input: new PassThrough(),
      output: new PassThrough(),
      signals,
    });

    let interrupts = 0;
    view.onInterrupt(() => { interrupts += 1; });

    signals.emit("SIGINT");
    signals.emit("SIGINT");

    expect(interrupts).toBe(2);
  });
});
