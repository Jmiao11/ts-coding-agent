import {
  describe,
  expect,
  it,
} from "vitest";

import {
  chooseUi,
} from "../src/config/choose-ui.js";


const interactiveTerminal = {
  settings: { ui: "tui" as const },
  tui: false,
  plain: false,
  interactive: true,
  stdinIsTTY: true,
  stdoutIsTTY: true,
};


describe("chooseUi", () => {
  it("uses the TUI by default in an interactive terminal", () => {
    expect(chooseUi(interactiveTerminal)).toEqual({ ui: "tui" });
  });

  it("uses plain output for a one-shot task", () => {
    expect(chooseUi({
      ...interactiveTerminal,
      interactive: false,
    })).toEqual({ ui: "plain" });
  });

  it("uses plain output when stdin or stdout is not a TTY", () => {
    expect(chooseUi({
      ...interactiveTerminal,
      stdinIsTTY: false,
    })).toEqual({ ui: "plain" });

    expect(chooseUi({
      ...interactiveTerminal,
      stdoutIsTTY: false,
    })).toEqual({ ui: "plain" });
  });

  it("uses the configured plain UI even in an interactive terminal", () => {
    expect(chooseUi({
      ...interactiveTerminal,
      settings: { ui: "plain" },
    })).toEqual({ ui: "plain" });
  });

  it("honours an explicit --plain", () => {
    expect(chooseUi({
      ...interactiveTerminal,
      plain: true,
    })).toEqual({ ui: "plain" });
  });

  it("rejects an explicit --tui without a TTY", () => {
    expect(chooseUi({
      ...interactiveTerminal,
      tui: true,
      stdoutIsTTY: false,
    })).toEqual({ error: "--tui 需要在交互式终端里运行。" });
  });

  it("rejects --plain together with --tui", () => {
    expect(chooseUi({
      ...interactiveTerminal,
      tui: true,
      plain: true,
    })).toEqual({ error: "--tui 和 --plain 只能选一个。" });
  });

  it("silently uses plain when a one-shot task asks for --tui", () => {
    expect(chooseUi({
      ...interactiveTerminal,
      tui: true,
      interactive: false,
    })).toEqual({ ui: "plain" });
  });
});
