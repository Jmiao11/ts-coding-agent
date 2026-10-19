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

  /** 确认问题期间按 Ctrl+C：readline 会收到这个按键，不会触发进程的 SIGINT，所以要转交出去 */
  onInterrupt?: () => void;
};


/** 普通终端：逐行打印，用 readline 提问。这就是 TUI 出现之前的行为 */
export function createPlainView(
  options: PlainViewOptions = {},
): AgentView {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY);

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
    info(text) {
      output.write(`${text}\n`);
    },

    warn(text) {
      errorOutput.write(`${text}\n`);
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
        () => options.onInterrupt?.(),
      );

      return answer?.trim().toLowerCase() === "y";
    },
  };
}