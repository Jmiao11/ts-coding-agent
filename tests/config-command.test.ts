import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseConfigCommand,
  parseReplConfigCommand,
} from "../src/config/config-command.js";


function errorOf(
  args: string[],
): string {
  const result = parseConfigCommand(args);

  if (!("error" in result)) {
    throw new Error(`expected an error, got ${JSON.stringify(result)}`);
  }

  return result.error;
}


describe("parseConfigCommand", () => {
  it("parses the supported commands", () => {
    expect(parseConfigCommand(["list"]))
      .toEqual({ command: { action: "list" } });
    expect(parseConfigCommand(["path"]))
      .toEqual({ command: { action: "path" } });
    expect(parseConfigCommand(["get", "ui"]))
      .toEqual({ command: { action: "get", key: "ui" } });
    expect(parseConfigCommand(["set", "sandbox", "mxc"]))
      .toEqual({ command: { action: "set", key: "sandbox", value: "mxc" } });
  });

  it("rejects an unknown key and lists the available keys", () => {
    const error = errorOf(["get", "colour"]);

    expect(error).toContain("不认识的设置项 colour");
    expect(error).toContain("ui、sandbox、nonGitDirectory");

    expect(errorOf(["set", "colour", "tui"]))
      .toContain("不认识的设置项 colour");
  });

  it("rejects an invalid value and lists the allowed values", () => {
    const error = errorOf(["set", "sandbox", "docker"]);

    expect(error).toContain("sandbox 只能是 host / codex / mxc");
    expect(error).toContain("docker");
  });

  it("rejects missing arguments", () => {
    expect(errorOf([])).toContain("config 需要一个子命令");
    expect(errorOf(["get"])).toContain("config get 需要设置项");
    expect(errorOf(["set"])).toContain("config set 需要设置项和值");
    expect(errorOf(["set", "ui"])).toContain("config set 需要设置项和值");
  });

  it("rejects unknown subcommands and extra arguments", () => {
    expect(errorOf(["rm"])).toContain("未知的 config 子命令：rm");
    expect(errorOf(["list", "extra"])).toContain("config list 不接受参数");
    expect(errorOf(["set", "ui", "plain", "extra"]))
      .toContain("config set 只接受设置项和一个值");
  });
});


function replErrorOf(
  args: string[],
): string {
  const result = parseReplConfigCommand(args);

  if (!("error" in result)) {
    throw new Error(`expected an error, got ${JSON.stringify(result)}`);
  }

  return result.error;
}


describe("parseReplConfigCommand", () => {
  it("lists settings with no arguments, and parses set", () => {
    expect(parseReplConfigCommand([]))
      .toEqual({ command: { action: "list" } });
    expect(parseReplConfigCommand(["set", "ui", "plain"]))
      .toEqual({ command: { action: "set", key: "ui", value: "plain" } });
  });

  it("rejects unknown keys, values and arguments", () => {
    expect(replErrorOf(["get", "ui"]))
      .toContain("未知的 /config 命令：get");
    expect(replErrorOf(["set", "colour", "plain"]))
      .toContain("不认识的设置项 colour");
    expect(replErrorOf(["set", "sandbox", "docker"]))
      .toContain("sandbox 只能是 host / codex / mxc");
    expect(replErrorOf(["set"]))
      .toContain("config set 需要设置项和值");
    expect(replErrorOf(["set", "ui"]))
      .toContain("config set 需要设置项和值");
    expect(replErrorOf(["set", "ui", "plain", "extra"]))
      .toContain("config set 只接受设置项和一个值");
  });
});
