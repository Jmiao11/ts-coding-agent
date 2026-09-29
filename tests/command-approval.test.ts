import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createCommandApprovalExtension,
} from "../src/extensions/command-approval.js";


function runCommandCall(command: string) {
  return {
    turnIndex: 0,
    toolCall: {
      type: "toolCall" as const,
      id: "call-1",
      name: "run_command",
      arguments: { command },
    },
  };
}


describe("command approval", () => {
  it("runs allowlisted commands and other tools without asking", async () => {
    const asked: string[] = [];

    const extension = createCommandApprovalExtension({
      approve: async (command) => {
        asked.push(command);
        return false;
      },
    });

    expect(
      await extension.hooks.beforeToolCall?.(runCommandCall("pnpm test")),
    ).toBeUndefined();

    expect(
      await extension.hooks.beforeToolCall?.(runCommandCall("git diff --stat")),
    ).toBeUndefined();

    expect(
      await extension.hooks.beforeToolCall?.({
        turnIndex: 0,
        toolCall: {
          type: "toolCall",
          id: "call-2",
          name: "read_file",
          arguments: { path: "package.json" },
        },
      }),
    ).toBeUndefined();

    expect(asked).toEqual([]);
  });


  it("asks for anything else, including allowlisted commands chained with others", async () => {
    const asked: string[] = [];

    const extension = createCommandApprovalExtension({
      approve: async (command) => {
        asked.push(command);
        return false;
      },
    });

    const chained = await extension.hooks.beforeToolCall?.(
      runCommandCall("git status && del src\\x.ts"),
    );

    expect(chained).toMatchObject({ block: true });

    const multiline = await extension.hooks.beforeToolCall?.(
      runCommandCall("git status\ndel src\\x.ts"),
    );

    expect(multiline).toMatchObject({ block: true });

    const output = await extension.hooks.beforeToolCall?.(
      runCommandCall('git diff "--output=patch.txt"'),
    );

    expect(output).toMatchObject({ block: true });

    const script = await extension.hooks.beforeToolCall?.(
      runCommandCall("powershell -File patch.ps1"),
    );

    expect(script).toMatchObject({ block: true });

    expect(asked).toEqual([
      "git status && del src\\x.ts",
      "git status\ndel src\\x.ts",
      'git diff "--output=patch.txt"',
      "powershell -File patch.ps1",
    ]);
  });
});
