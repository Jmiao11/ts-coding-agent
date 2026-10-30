import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

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

import {
  DEFAULT_SETTINGS,
  loadSettings,
  parseSettings,
  resolveSettings,
  saveSetting,
} from "../src/config/settings.js";


describe("parseSettings", () => {
  it("keeps valid settings and warns about everything else instead of failing", () => {
    const { settings, warnings } = parseSettings(JSON.stringify({
      ui: "plain",
      sandbox: "docker",
      colour: "blue",
    }));

    expect(settings).toEqual({ ui: "plain" });
    expect(warnings).toHaveLength(2);
    expect(warnings.join("\n")).toContain("sandbox 只能是 host / codex / mxc");
    expect(warnings.join("\n")).toContain("colour");
  });

  it("falls back to nothing when the file is not a JSON object", () => {
    expect(parseSettings("{ ui: tui").settings).toEqual({});
    expect(parseSettings("[]").settings).toEqual({});
    expect(parseSettings("{ ui: tui").warnings).toHaveLength(1);
  });
});


describe("resolveSettings", () => {
  it("lets later layers win, and skips what a layer does not say", () => {
    const fromFile = { ui: "plain", sandbox: "mxc" } as const;
    const fromFlags = { sandbox: "host" } as const;

    expect(resolveSettings(fromFile, fromFlags)).toEqual({
      ui: "plain",
      sandbox: "host",
      nonGitDirectory: DEFAULT_SETTINGS.nonGitDirectory,
    });

    expect(resolveSettings()).toEqual(DEFAULT_SETTINGS);
  });
});


describe("settings file", () => {
  let directory: string;
  let path: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-settings-"));
    path = join(directory, "nested", "config.json");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("treats a missing file as no settings", () => {
    expect(loadSettings(path)).toEqual({ settings: {}, warnings: [], broken: false });
  });

  it("saves only the settings the user changed, keeping earlier ones", () => {
    saveSetting(path, "sandbox", "mxc");
    saveSetting(path, "ui", "plain");

    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ sandbox: "mxc", ui: "plain" });
    expect(loadSettings(path).settings).toEqual({ sandbox: "mxc", ui: "plain" });
  });

  it("drops invalid entries from a hand-edited file when saving", () => {
    saveSetting(path, "ui", "plain");
    writeFileSync(path, JSON.stringify({ ui: "plain", sandbox: "docker" }), "utf8");

    saveSetting(path, "nonGitDirectory", "allow");

    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ ui: "plain", nonGitDirectory: "allow" });
  });

  it("refuses to overwrite a file it cannot read, so a typo does not wipe the user's settings", () => {
    saveSetting(path, "ui", "plain");
    writeFileSync(path, '{ "ui": "plain", }', "utf8");

    expect(() => saveSetting(path, "sandbox", "mxc")).toThrow("没有保存");
    expect(readFileSync(path, "utf8")).toBe('{ "ui": "plain", }');
  });
});