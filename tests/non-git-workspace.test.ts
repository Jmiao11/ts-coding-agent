import {
  describe,
  expect,
  it,
} from "vitest";

import {
  decideNonGitWorkspace,
  protectedDirectoryReason,
  type PathRules,
} from "../src/config/non-git-workspace.js";


describe("protectedDirectoryReason", () => {
  const windows: PathRules = {
    platform: "win32",
    home: "C:\\Users\\Jmiao",
    systemDirectories: ["C:\\Windows", "C:\\Program Files"],
  };

  const linux: PathRules = {
    platform: "linux",
    home: "/home/jmiao",
    systemDirectories: ["/etc", "/usr"],
  };

  it("protects drive roots, the home directory and the directories above it", () => {
    expect(protectedDirectoryReason("F:\\", windows)).toBe("磁盘根目录");
    expect(protectedDirectoryReason("C:\\Users\\Jmiao", windows)).toBe("用户主目录");
    expect(protectedDirectoryReason("C:\\Users", windows)).toBe("用户主目录的上级目录");
    expect(protectedDirectoryReason("/", linux)).toBe("磁盘根目录");
    expect(protectedDirectoryReason("/home/jmiao/", linux)).toBe("用户主目录");
  });

  it("protects system directories and everything inside them", () => {
    expect(protectedDirectoryReason("C:\\Windows\\System32", windows)).toBe("系统目录");
    expect(protectedDirectoryReason("/usr/local/lib", linux)).toBe("系统目录");
  });

  it("compares Windows paths without caring about case or a trailing backslash", () => {
    expect(protectedDirectoryReason("c:\\users\\JMIAO\\", windows)).toBe("用户主目录");
    expect(protectedDirectoryReason("c:\\program files\\nodejs", windows)).toBe("系统目录");
  });

  it("leaves ordinary project directories alone, including ones that only share a prefix", () => {
    expect(protectedDirectoryReason("C:\\Users\\Jmiao\\code\\demo", windows)).toBeUndefined();
    expect(protectedDirectoryReason("F:\\学习资料\\大模型\\demo", windows)).toBeUndefined();
    // C:\Windows 的前缀，但不在它里面
    expect(protectedDirectoryReason("C:\\WindowsApps-backup", windows)).toBeUndefined();
    expect(protectedDirectoryReason("/home/jmiao2", linux)).toBeUndefined();
  });
});


describe("decideNonGitWorkspace", () => {
  const base = { interactive: true, gitInstalled: true, protectedReason: undefined };

  it("follows the policy in an ordinary directory", () => {
    expect(decideNonGitWorkspace({ ...base, policy: "init" })).toEqual({ action: "init" });
    expect(decideNonGitWorkspace({ ...base, policy: "allow" })).toEqual({ action: "allow" });
    expect(decideNonGitWorkspace({ ...base, policy: "ask" })).toEqual({ action: "ask", canInit: true });
  });

  it("never runs silently in a protected directory, whatever the policy says", () => {
    for (const policy of ["ask", "init", "allow"] as const) {
      expect(decideNonGitWorkspace({ ...base, policy, protectedReason: "用户主目录" }))
        .toEqual({ action: "ask", canInit: false });

      expect(decideNonGitWorkspace({ ...base, policy, interactive: false, protectedReason: "用户主目录" }).action)
        .toBe("refuse");
    }
  });

  it("asks instead of initializing when git is missing, and refuses when it cannot ask", () => {
    expect(decideNonGitWorkspace({ ...base, policy: "init", gitInstalled: false }))
      .toEqual({ action: "ask", canInit: false });

    const refused = decideNonGitWorkspace({ ...base, policy: "ask", interactive: false });
    expect(refused.action).toBe("refuse");
    expect(refused.action === "refuse" && refused.reason).toContain("config set nonGitDirectory");
  });
});