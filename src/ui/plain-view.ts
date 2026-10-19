import {
  createInterface,
} from "node:readline/promises";

import type {
  Readable,
  Writable,
} from "node:stream";

import type {
  AgentView,
} from "./agent-view.js";


export type PlainViewOptions = {
  /** 默认 process.stdin / stdout / stderr；测试时传假的流 */
  input?: Readable;
  output?: Writable;
  errorOutput?: Writable;

  /** 有没有人能回答问题。默认看 stdin 是不是终端 */
  interactive?: boolean;

  /** SIGINT 从哪里来，默认 process；测试时传一个 EventEmitter */
  signals?: { on(event: "SIGINT", listener: () => void): unknown };
};


/** 普通终端：逐行打印，用 readline 提问。这就是 TUI 出现之前的行为 */
export function createPlainView(
  options: PlainViewOptions = {},
): AgentView {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY);
  const signals = options.signals ?? process;

  // 确认问题期间 Ctrl+C 由 readline 收到，也转交给同一个 handler。
  let interruptHandler: (() => void) | undefined;

  /** 问一个问题；Ctrl+C 或输入关闭时返回 null */
  function ask(
    question: string,
    onSigint: () => void,
  ): Promise<string | null> {
    const rl = createInterface({ input, output });

    return new Promise<string | null>((resolvePromise) => {
      let settled = false;

      const settle = (value: string | null): void => {
        if (!settled) {
          settled = true;
          resolvePromise(value);
        }
      };

      rl.on("SIGINT", () => {
        output.write("\n");
        onSigint();
        settle(null);
        rl.close();
      });

      rl.once("close", () => settle(null));

      rl.question(question).then(
        (answer) => {
          settle(answer);
          // 每次问完就 close，否则 stdin 一直打开，进程无法退出
          rl.close();
        },
        () => settle(null),
      );
    });
  }

  return {
    header({ workspace, model, sandbox, thinking }) {
      output.write(`workspace: ${workspace}\nmodel: ${model}\n`);
      if (thinking !== undefined) output.write(`thinking: ${thinking}\n`);
      output.write(`sandbox: ${sandbox}\n`);
    },

    replIntro() {
      output.write("\n交互模式：输入任务后回车运行；/help 查看命令，/exit、Ctrl+C 或 Ctrl+D 退出。任务运行中按 Ctrl+C 只中止当前任务。\n");
    },

    keyHelp() {},

    info(text) {
      output.write(`${text}\n`);
    },

    userMessage(text) {
      output.write(`task: ${text} \n\n`);
    },

    log(text) {
      output.write(`${text}\n`);
    },

    setDebug() {},

    toolOutput(title, text) {
      output.write(`\n----- ${title} output -----\n${text}\n------------------------------\n\n`);
    },

    status() {},

    warn(text) {
      errorOutput.write(`${text}\n`);
    },

    beginAnswer() {
      output.write("\n[assistant] ");
    },

    appendAnswer(delta) {
      output.write(delta);
    },

    endAnswer() {
      output.write("\n\n");
    },

    readLine(prompt) {
      return ask(prompt, () => {});
    },

    async confirm(question) {
      if (!interactive) {
        return false;
      }

      const answer = await ask(
        `${question} [y/N] `,
        () => interruptHandler?.(),
      );

      return answer?.trim().toLowerCase() === "y";
    },

    onInterrupt(handler) {
      interruptHandler = handler;
      signals.on("SIGINT", handler);
    },

    // 日志扩展已经输出工具开始与结束，普通终端不重复显示。
    toolStart() {},
    toolEnd() {},

    close() {},
  };
}
