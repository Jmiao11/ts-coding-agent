import {
  existsSync,
} from "node:fs";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  mapWorkspaceToDrive,
} from "../src/tools/drive-mapping.js";


const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");


function asWindows<T>(action: () => T): T {
  Object.defineProperty(process, "platform", { ...platformDescriptor, value: "win32" });

  try {
    return action();
  } finally {
    if (platformDescriptor) {
      Object.defineProperty(process, "platform", platformDescriptor);
    }
  }
}


function result(stdout = "", status = 0) {
  return { status, stdout };
}


describe("mapWorkspaceToDrive", () => {
  afterEach(() => {
    if (platformDescriptor) {
      Object.defineProperty(process, "platform", platformDescriptor);
    }
  });

  it("parses Unicode paths and reuses an existing workspace mapping", () => {
    const calls: string[][] = [];
    const mapping = asWindows(() => mapWorkspaceToDrive(
      "F:\\学习资料\\agent-harness",
      (args) => {
        calls.push(args);
        return result("W:\\: => F:\\学习资料\\agent-harness\\\r\n");
      },
    ));

    expect(mapping.drive).toBe("W:");
    expect(mapping.root).toBe("W:\\");
    mapping.release();
    mapping.release();
    expect(calls).toEqual([[]]);
  });

  it("skips occupied subst drives and verifies the new mapping", () => {
    const calls: string[][] = [];
    const mappings = new Map([["Z:", "F:\\another-repo"]]);
    const expected = [..."ZYXWVUTSRQPONMLKJIHGFEDCBA"].find((letter) => {
      const drive = `${letter}:`;
      return !mappings.has(drive) && !existsSync(`${drive}\\`);
    });
    expect(expected).toBeDefined();

    const workspace = "F:\\mxc-probe\\ws\\repo";
    const mapping = asWindows(() => mapWorkspaceToDrive(workspace, (args) => {
      calls.push(args);

      if (args.length === 0) {
        return result([...mappings].map(([drive, target]) => `${drive}\\: => ${target}`).join("\r\n"));
      }

      if (args[1] === "/D") {
        mappings.delete(args[0] ?? "");
      } else {
        mappings.set(args[0] ?? "", args[1] ?? "");
      }
      return result();
    }));

    expect(mapping.drive).toBe(`${expected}:`);
    expect(calls.slice(0, 3)).toEqual([
      [],
      [mapping.drive, workspace],
      [],
    ]);
    mapping.release();
  });

  it("throws when the created mapping cannot be found", () => {
    const calls: string[][] = [];

    expect(() => asWindows(() => mapWorkspaceToDrive("F:\\repo", (args) => {
      calls.push(args);
      return result();
    }))).toThrow(/was not present after creation/u);

    expect(calls.slice(0, 3)).toEqual([[], ["Z:", "F:\\repo"], []]);
  });

  it("releases a mapping once, even when release is called repeatedly", () => {
    const calls: string[][] = [];
    let created = false;
    const workspace = "F:\\mxc-probe\\ws\\repo";
    const mapping = asWindows(() => mapWorkspaceToDrive(workspace, (args) => {
      calls.push(args);

      if (args.length === 0) {
        return result(created ? `Z:\\: => ${workspace}\r\n` : "");
      }

      if (args[1] === workspace) {
        created = true;
      } else if (args[1] === "/D") {
        created = false;
      }

      return result();
    }));

    mapping.release();
    mapping.release();

    expect(calls).toEqual([
      [],
      ["Z:", workspace],
      [],
      [],
      ["Z:", "/D"],
    ]);
  });

  it("maps the workspace root and descendants, and rejects outside paths", () => {
    const mapping = asWindows(() => mapWorkspaceToDrive(
      "F:\\mxc-probe\\ws\\repo",
      () => result("V:\\: => F:\\mxc-probe\\ws\\repo\r\n"),
    ));

    expect(mapping.toMapped("F:\\mxc-probe\\ws\\repo")).toBe("V:\\");
    expect(mapping.toMapped("F:\\mxc-probe\\ws\\repo\\src\\tools")).toBe("V:\\src\\tools");
    expect(() => mapping.toMapped("F:\\mxc-probe\\outside\\file.txt")).toThrow(/outside the workspace/u);
  });

  it.skipIf(process.platform === "win32")("rejects unsupported platforms", () => {
    expect(() => mapWorkspaceToDrive("/repo", () => result())).toThrow(
      "drive mapping is only supported on Windows",
    );
  });
});
