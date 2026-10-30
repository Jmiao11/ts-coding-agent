import type {
  Settings,
} from "./settings.js";


export type UiChoiceOptions = {
  /** 合并了默认值、设置文件和命令行之后的设置 */
  settings: Pick<Settings, "ui">;

  /** 用户明确写了 --tui */
  tui: boolean;

  /** 用户明确写了 --plain */
  plain: boolean;

  /** 没有写任务描述：会进入交互模式 */
  interactive: boolean;

  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
};


export type UiChoice =
  | { ui: "tui" }
  | { ui: "plain" }
  | { error: string };


/**
 * 决定用哪个界面。纯函数：不读 process、不创建 view，方便测试。
 *
 * TUI 只在交互模式、且 stdin / stdout 都是终端时使用；其他情况静默用 plain。
 * 只有用户明确写了 --tui 却没有 TTY 才报错：来自设置文件或默认值的 tui
 * 只是默认偏好，不应该让一次性任务或管道运行失败。
 */
export function chooseUi(
  options: UiChoiceOptions,
): UiChoice {
  if (options.tui && options.plain) {
    return { error: "--tui 和 --plain 只能选一个。" };
  }

  if (options.tui && !(options.stdinIsTTY && options.stdoutIsTTY)) {
    return { error: "--tui 需要在交互式终端里运行。" };
  }

  if (options.plain) {
    return { ui: "plain" };
  }

  if (
    options.settings.ui !== "tui"
    || !options.interactive
    || !options.stdinIsTTY
    || !options.stdoutIsTTY
  ) {
    return { ui: "plain" };
  }

  return { ui: "tui" };
}
