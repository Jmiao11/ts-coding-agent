import {
  existsSync,
  writeFileSync,
} from "node:fs";

import {
  mkdtemp,
  rm,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import type {
  CommandExecutor,
} from "../src/tools/command-executor.js";

import {
  checkMxcIsolation,
} from "../src/tools/mxc-executor.js";


describe("MXC isolation self-check", () => {
  let workspace: string;
  let outside: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "agent-harness-ws-"));
    outside = join(await mkdtemp(join(tmpdir(), "agent-harness-out-")), "probe.txt");
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
    await rm(join(outside, ".."), { recursive: true, force: true });
  });

  function fakeExecutor(sandbox: { insideWorks: boolean; outsideBlocked: boolean }) {
    const commands: string[] = [];
    const executor: CommandExecutor = {
      async run(request) {
        commands.push(request.command);
        const writesOutside = request.command.includes(outside);
        const allowed = writesOutside ? !sandbox.outsideBlocked : sandbox.insideWorks;

        if (allowed) {
          writeFileSync(
            writesOutside ? outside : join(workspace, ".agent-harness", "tmp", "mxc-selfcheck.txt"),
            "x",
          );
        }

        return {
          output: Buffer.from(allowed ? "" : "Access is denied.\r\n"),
          droppedHead: false,
          exitCode: allowed ? 0 : 1,
          timedOut: false,
          aborted: false,
        };
      },
    };

    return { executor, commands };
  }

  it("passes when the workspace is writable and an outside write is blocked", async () => {
    const { executor, commands } = fakeExecutor({ insideWorks: true, outsideBlocked: true });

    await checkMxcIsolation(executor, workspace, outside);

    expect(commands).toHaveLength(2);
    expect(existsSync(join(workspace, ".agent-harness", "tmp", "mxc-selfcheck.txt"))).toBe(false);
  });

  it("refuses when an outside write succeeds and removes the probe file", async () => {
    const { executor } = fakeExecutor({ insideWorks: true, outsideBlocked: false });

    await expect(checkMxcIsolation(executor, workspace, outside)).rejects.toThrow("没有拦住工作区外的写入");
    expect(existsSync(outside)).toBe(false);
  });

  it("refuses when the workspace is not writable", async () => {
    const { executor } = fakeExecutor({ insideWorks: false, outsideBlocked: true });

    await expect(checkMxcIsolation(executor, workspace, outside)).rejects.toThrow("无法写入工作区");
  });
});
