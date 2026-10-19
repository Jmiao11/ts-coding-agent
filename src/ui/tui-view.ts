import {
  Container,
  Editor,
  Markdown,
  matchesKey,
  ProcessTerminal,
  Text,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  TuiMainScreen,
  type Component,
  type EditorTheme,
  type MarkdownTheme,
  type Terminal,
} from "@earendil-works/pi-tui";

import type {
  AgentView,
} from "./agent-view.js";

import { ToolActivityGroup } from "./tool-group.js";


// 颜色只用最基本的几种 ANSI 样式：所有终端都支持，也不依赖亮色 / 暗色主题
const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[22m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[39m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[39m`;
const plain = (text: string) => text;

class History extends Container {
  override render(width: number): string[] {
    const rows = super.render(width);
    // 相邻块各自留白时，只保留一行分隔。
    return rows.filter((row, index) => index === 0
      || stripTerminalSequences(row).trim() !== ""
      || stripTerminalSequences(rows[index - 1]!).trim() !== "");
  }
}

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
  const history = new History();
  const editor = new Editor(tui, editorTheme);
  let statusText = "";
  const bottomBar: Component = {
    invalidate() {},
    render(width) {
      const right = "Enter 发送 · Ctrl+O 详情 · /help";
      const room = width - visibleWidth(right) - 2;
      if (room <= 0) return [dim(truncateToWidth(right, width, "…", true))];
      const left = truncateToWidth(statusText, room, "…", true);
      return [dim(`${left}  ${right}`)];
    },
  };

  tui.addChild(history);
  tui.addChild(editor);
  tui.addChild(bottomBar);
  tui.setFocus(editor);

  // 不在等输入的时候（比如任务运行中）不接受提交，免得输入被吞掉
  editor.disableSubmit = true;

  let pendingLine: ((line: string | null) => void) | undefined;
  let pendingConfirm: ((answer: boolean) => void) | undefined;
  let recordApproval: ((answer: boolean) => void) | undefined;
  let interruptHandler: (() => void) | undefined;
  let answer: Markdown | undefined;
  let answerText = "";
  let stopped = false;
  let debug = false;
  let group: ToolActivityGroup | undefined;
  let latestGroup: ToolActivityGroup | undefined;
  const runningTools = new Map<string, ToolActivityGroup>();

  function ensureGroup(): ToolActivityGroup {
    if (!group) {
      group = new ToolActivityGroup(tui);
      latestGroup = group;
      history.addChild(group);
    }
    return group;
  }

  function finishGroup(aborted = false): void {
    group?.finish(aborted);
    group = undefined;
  }

  function interrupt(): void {
    finishGroup(true);
    interruptHandler?.();
  }

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
    show(`\n${bold(`❯ ${text}`)}`);
    resolveLine(text);
  };

  // 输入先经过这里，再交给输入框；consume: true 表示这个按键到此为止
  tui.addInputListener((data) => {
    if (matchesKey(data, "ctrl+o")) {
      // 只改最近一组：更早的组可能已进回滚区，TuiMainScreen 会因 firstChanged < viewportTop 清屏重画。
      latestGroup?.toggle();
      return { consume: true };
    }

    if (pendingConfirm) {
      const resolveConfirm = pendingConfirm;
      pendingConfirm = undefined;
      const yes = data.toLowerCase() === "y";
      if (recordApproval) {
        recordApproval(yes);
        recordApproval = undefined;
      } else {
        show(dim(yes ? "  → 允许" : "  → 拒绝"));
      }

      if (matchesKey(data, "ctrl+c")) {
        // 和普通终端一样：中止当前任务，这次命令当作拒绝
        interrupt();
      }

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
        interrupt();
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
    header({ workspace, model, sandbox }) {
      // sandboxLabel 的括号说明属于普通终端的启动文案。
      show(`${bold("TS Coding Agent")}${dim(` · ${model} · sandbox: ${sandbox.split("（", 1)[0]}`)}\n${dim(workspace)}`);
    },

    replIntro() {},

    keyHelp() {
      show(dim("Ctrl+O 展开 / 收起最近一组工具详情。"));
    },

    info(text) {
      show(text);
    },

    userMessage(text) {
      show(`\n${bold(`❯ ${text}`)}`);
    },

    log(text) {
      if (debug) {
        show(dim(text));
      }
    },

    setDebug(enabled) {
      debug = enabled;
      return true;
    },

    // TUI 使用 toolEnd 的结构化 detail，不使用 cli 拼好的文字。
    toolOutput() {},

    status(text) {
      statusText = text.replace(" · sandbox: ", " · ");
      tui.requestRender();
    },

    warn(text) {
      show(yellow(text));
    },

    readLine(prompt) {
      finishGroup();
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

    confirm(question, command) {
      if (command !== undefined) {
        recordApproval = ensureGroup().requestApproval(question, command);
      } else {
        show(`\n${yellow(`${question.trim()} [y/N]`)}`);
      }

      return new Promise((resolvePromise) => {
        pendingConfirm = resolvePromise;
      });
    },

    beginAnswer() {
      finishGroup();
      answerText = "";
      answer = new Markdown("", 0, 1, markdownTheme);
      const markdown = answer;
      history.addChild({
        invalidate: () => markdown.invalidate(),
        render: (width) => markdown.render(Math.max(1, width - 2))
          .map((line, index) => `${index === 1 ? cyan("●") : " "} ${line}`),
      });
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
      const current = ensureGroup();
      runningTools.set(id, current);
      current.start(id, name, summary);
    },

    toolEnd(id, ok, detail) {
      const tool = runningTools.get(id);

      if (!tool) {
        return;
      }

      runningTools.delete(id);
      tool.end(id, ok, detail);
    },

    onInterrupt(handler) {
      interruptHandler = handler;
    },

    close() {
      if (stopped) {
        return;
      }

      stopped = true;
      finishGroup();
      tui.removeChild(editor);
      tui.removeChild(bottomBar);
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
