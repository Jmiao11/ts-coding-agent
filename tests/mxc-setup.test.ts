import {
  describe,
  expect,
  it,
} from "vitest";

import {
  findForeignOwners,
} from "../src/tools/mxc-setup.js";


describe("findForeignOwners", () => {
  it("returns the names of foreign-owned directories and files", () => {
    expect(findForeignOwners([
      { name: "src", owner: "MACHINE\\me" },
      { name: "tests", owner: "MACHINE\\CodexSandboxOffline" },
      { name: "README.md", owner: "BUILTIN\\Administrators" },
    ], "MACHINE\\me")).toEqual(["tests", "README.md"]);
  });

  it("compares account names without case sensitivity and preserves entry names", () => {
    expect(findForeignOwners([
      { name: "SRC", owner: "machine\\ME" },
      { name: "Tests", owner: "MACHINE\\CodexSandboxOffline" },
    ], "Machine\\me")).toEqual(["Tests"]);
  });

  it("returns no names for an empty list or entries owned by the current user", () => {
    expect(findForeignOwners([], "MACHINE\\me")).toEqual([]);
    expect(findForeignOwners([
      { name: "src", owner: "MACHINE\\me" },
    ], "MACHINE\\me")).toEqual([]);
  });
});
