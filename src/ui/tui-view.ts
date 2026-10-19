import {
  Container,
  Editor,
  Markdown,
  matchesKey,
  ProcessTerminal,
  Text,
  TruncatedText,
  TuiMainScreen,
  type EditorTheme,
  type MarkdownTheme,
  type Terminal,
} from "@earendil-works/pi-tui";

import type {
  AgentView,
} from "./agent-view.js";


// 颜色只用最基本的几种 ANSI 样式：所有终端都支持，也不依赖亮色 / 暗色主题
const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[22m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[39m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[39m`;
const plain = (text: string) => text;

const markdownTheme: MarkdownTheme = {
  heading: bold,
  link: cyan,
  linkUrl: dim,
  code: cyan,
  codeBlock: plain,
  codeBlockBorder: dim,
  quote: plain,
  quoteBorder: dim,
  hr: dim,
  listBullet: dim,
  bold,
  italic: plain,
  strikethrough: plain,
  underline: plain,
};

const editorTheme: EditorTheme = {
  borderColor: dim,
  selectList: {
    selectedPrefix: cyan,
    selectedText: cyan,
    description: dim,
    scrollInfo: dim,
    noMatch: dim,
  },
};


export type TuiViewOptions = {
  /** 默认是真实终端；测试时传假的 */
  terminal?: Terminal;

  /** 进程退出时自动恢复终端（默认开）。测试里关掉，免得往 vitest 进程上挂监听 */
  exitHook?: boolean;
};


/**
 * 用 pi-tui 实现的界面：上面是历史记录（信息、回答），下面始终是输入框。
 * 和 PlainView 实现同一个 AgentView 接口，cli 不需要知道用的是哪一个。
 */
export function createTuiView(
  options: TuiViewOptions = {},
): AgentView {
  const terminal = options.terminal ?? new ProcessTerminal();
  const tui = new TuiMainScreen(terminal);

  // T0 实测：Windows 上要打开硬件光标，输入法候选框才跟着光标走
  tui.setShowHardwareCursor(true);

  // addChild 只会追加到末尾：先放历史记录，再放输入框，输入框就一直在最下面
  const history = new Container();
  const statusLine = new Container();
  const editor = new Editor(tui, editorTheme);
  const hint = new Text(dim("Enter 发送 · Ctrl+C 中止 · /help"), 0, 0);

  tui.addChild(history);
  tui.addChild(statusLine);
  tui.addChild(editor);
  tui.addChild(hint);
  tui.setFocus(editor);

  // 不在等输入的时候（比如任务运行中）不接受提交，免得输入被吞掉
  editor.disableSubmit = true;

  let pendingLine: ((line: string | null) => void) | undefined;
  let pendingConfirm: ((answer: boolean) => void) | undefined;
  let interruptHandler: (() => void) | undefined;
  let answer: Markdown | undefined;
  let answerText = "";
  let stopped = false;
  let debug = false;
  const runningTools = new Map<string, { line: Text; label: string }>();

  function show(text: string): void {
    history.addChild(new Text(text, 0, 0));
    tui.requestRender();
  }

  editor.onSubmit = (text) => {
    const resolveLine = pendingLine;

    if (!resolveLine) {
      return;
    }

    pendingLine = undefined;
    editor.disableSubmit = true;
    editor.setText("");
    show(bold(`❯ ${text}`));
    resolveLine(text);
  };

  // 输入先经过这里，再交给输入框；consume: true 表示这个按键到此为止
  tui.addInputListener((data) => {
    if (pendingConfirm) {
      const resolveConfirm = pendingConfirm;
      pendingConfirm = undefined;

      if (matchesKey(data, "ctrl+c")) {
        // 和普通终端一样：中止当前任务，这次命令当作拒绝
        interruptHandler?.();
      }

      const yes = data.toLowerCase() === "y";
      show(dim(yes ? "  → 允许" : "  → 拒绝"));
      resolveConfirm(yes);
      return { consume: true };
    }

    if (matchesKey(data, "ctrl+c")) {
      if (pendingLine) {
        // 在提示符处：和普通终端的 readline 一样，表示「不输入了」
        const resolveLine = pendingLine;
        pendingLine = undefined;
        editor.disableSubmit = true;
        resolveLine(null);
      } else {
        interruptHandler?.();
      }

      return { consume: true };
    }

    if (matchesKey(data, "ctrl+d") && pendingLine && editor.getText() === "") {
      const resolveLine = pendingLine;
      pendingLine = undefined;
      editor.disableSubmit = true;
      resolveLine(null);
      return { consume: true };
    }

    return undefined;
  });

  tui.start();

  const view: AgentView = {
    info(text) {
      show(text);
    },

    userMessage(text) {
      show(bold(`❯ ${text}`));
    },

    log(text) {
      if (debug) {
        show(dim(text));
      }
    },

    setDebug(enabled) {
      debug = enabled;
    },

    // TUI 使用 toolEnd 的结构化 detail，不使用 cli 拼好的文字。
    toolOutput() {},

    status(text) {
      statusLine.clear();
      statusLine.addChild(new TruncatedText(dim(text), 0, 0));
      tui.requestRender();
    },

    warn(text) {
      show(yellow(text));
    },

    readLine(prompt) {
      // 提示符本身（比如 "\n> "）不用显示：输入框就在下面
      const label = prompt.trim();

      if (label.length > 0 && label !== ">") {
        show(label);
      }

      editor.disableSubmit = false;

      return new Promise((resolvePromise) => {
        pendingLine = resolvePromise;
      });
    },

    confirm(question) {
      show(yellow(`${question.trim()} [y/N]`));

      return new Promise((resolvePromise) => {
        pendingConfirm = resolvePromise;
      });
    },

    beginAnswer() {
      answerText = "";
      answer = new Markdown("", 0, 1, markdownTheme);
      history.addChild(answer);
    },

    appendAnswer(delta) {
      answerText += delta;
      // 每段都重新渲染整条回答：Markdown 要看到完整文本才能正确排版（比如代码块的结尾）
      answer?.setText(answerText);
      tui.requestRender();
    },

    endAnswer() {
      answer = undefined;
      tui.requestRender();
    },

    toolStart(id, name, summary) {
      const label = summary ? `${name} ${dim(summary)}` : name;
      const line = new Text(`${dim("⋯")} ${label}`, 0, 0);

      runningTools.set(id, { line, label });
      history.addChild(line);
      tui.requestRender();
    },

    toolEnd(id, ok) {
      const tool = runningTools.get(id);

      if (!tool) {
        return;
      }

      runningTools.delete(id);
      tool.line.setText(`${ok ? cyan("✓") : yellow("✗")} ${tool.label}`);
      tui.requestRender();
    },

    onInterrupt(handler) {
      interruptHandler = handler;
    },

    close() {
      if (stopped) {
        return;
      }

      stopped = true;
      tui.removeChild(editor);
      tui.removeChild(statusLine);
      tui.removeChild(hint);
      // 先把还没画出来的内容画完，否则最后几行（统计、提示）会丢
      tui.renderNow();
      tui.stop();
    },
  };

  if (options.exitHook ?? true) {
    // cli 里有很多 process.exit()：退出前一定要恢复终端，否则终端会停在原始模式
    process.once("exit", () => view.close());
  }

  return view;
}
