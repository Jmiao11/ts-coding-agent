import {
  spawnSync,
} from "node:child_process";

import {
  mkdirSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  dirname,
  join,
} from "node:path";

import type {
  CommandExecutor,
} from "./command-executor.js";

import {
  mapWorkspaceToDrive,
} from "./drive-mapping.js";

import {
  checkMxcIsolation,
  createMxcExecutor,
  mxcEnvironment,
  type MxcSdk,
} from "./mxc-executor.js";


const MXC_SDK_MODULE = "@microsoft/mxc-sdk/v1";


type MxcSdkModule = MxcSdk & {
  getPlatformSupport(): {
    isSupported: boolean;
    reason?: string;
    isolationTier?: string;
    isolationWarnings?: string[];
  };
};


export type MxcSandbox = {
  executor: CommandExecutor;
  label: string;
  warnings: string[];
};


export function findForeignOwners(
  entries: { name: string; owner: string }[],
  currentUser: string,
): string[] {
  return entries
    .filter((entry) => entry.owner.toLowerCase() !== currentUser.toLowerCase())
    .map((entry) => entry.name);
}


export function envWithoutPSModulePath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => name.toUpperCase() !== "PSMODULEPATH"),
  );
}


function workspaceOwnerWarnings(workspaceRoot: string): string[] {
  try {
    const result = spawnSync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", [
        "$ErrorActionPreference = 'Stop'",
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
        "$entries = @(Get-ChildItem -LiteralPath $env:TSA_MXC_WORKSPACE -Force | Where-Object { $_.Name -notin @('.git', 'node_modules') } | ForEach-Object { @{ name = $_.Name; owner = (Get-Acl -LiteralPath $_.FullName).Owner } })",
        "@{ currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name; entries = $entries } | ConvertTo-Json -Depth 3 -Compress",
      ].join("; ")],
      {
        encoding: "utf8",
        windowsHide: true,
        env: { ...envWithoutPSModulePath(process.env), TSA_MXC_WORKSPACE: workspaceRoot },
      },
    );

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `PowerShell 退出码 ${result.status}`);
    }

    const { entries, currentUser } = JSON.parse(result.stdout) as {
      entries: { name: string; owner: string }[];
      currentUser: string;
    };
    const names = findForeignOwners(entries, currentUser);

    if (names.length === 0) {
      return [];
    }

    const owners = [...new Set(entries.filter((entry) => names.includes(entry.name)).map((entry) => entry.owner))];

    return [
      `这些目录或文件的所有者是 ${owners.join(", ")}，MXC 沙箱里的命令可能读不到它们：${names.join(", ")}。`
      + "修复方法：先关闭 PyCharm 和 Codex 桌面版，然后以当前用户把这些条目复制一份再替换掉原条目（见 README 的 Sandboxes 一节）。",
    ];
  } catch (error) {
    return [`无法检查工作区顶层条目的所有者：${error instanceof Error ? error.message : String(error)}`];
  }
}


export async function setupMxcSandbox(
  workspaceRoot: string,
): Promise<MxcSandbox> {
  if (process.platform !== "win32") {
    throw new Error("--sandbox mxc 目前只支持 Windows。");
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);

  if (nodeMajor < 24) {
    throw new Error(
      `MXC SDK 需要 Node.js 24 或更高版本（当前 ${process.version}，路径 ${process.execPath}）。`,
    );
  }

  let sdk: MxcSdkModule;

  try {
    sdk = (await import(MXC_SDK_MODULE)) as MxcSdkModule;
  } catch (error) {
    throw new Error(
      `无法加载 ${MXC_SDK_MODULE}：${error instanceof Error ? error.message : String(error)}\n`
      + "从源码运行：在项目目录执行 pnpm install；全局安装后仍缺少 SDK（可选依赖安装失败）时，执行 npm i -g @microsoft/mxc-sdk@1.0.0（需要 Windows、Node 24+）。",
    );
  }

  // getAvailableBackends() 在 SDK 装于中文路径时会因 UTF-8 路径切片而 panic。
  const support = sdk.getPlatformSupport();

  if (!support.isSupported) {
    throw new Error(`这台机器不支持 MXC：${support.reason || "未知原因"}`);
  }

  const mapping = mapWorkspaceToDrive(workspaceRoot);

  try {
    mkdirSync(join(workspaceRoot, ".agent-harness", "tmp"), { recursive: true });

    const autocrlf = spawnSync(
      "git",
      ["config", "--get", "core.autocrlf"],
      { cwd: workspaceRoot, encoding: "utf8" },
    );
    const autocrlfValue = autocrlf.status === 0 ? autocrlf.stdout.trim() : "";
    const nodeDirectory = dirname(process.execPath);
    const readonlyPaths = [
      nodeDirectory,
      ...(process.env.AGENT_MXC_READONLY ?? "")
        .split(";")
        .map((path) => path.trim())
        .filter((path) => path.length > 0),
    ];
    const environment = mxcEnvironment(process.env, {
      tempDir: join(mapping.root, ".agent-harness", "tmp"),
      ...(autocrlfValue ? { autocrlf: autocrlfValue } : {}),
    });

    environment.PATH = `${nodeDirectory};${environment.PATH ?? ""}`;

    const executor = createMxcExecutor({
      sdk,
      mapping,
      readonlyPaths,
      environment,
    });

    await checkMxcIsolation(
      executor,
      workspaceRoot,
      join(tmpdir(), `tsa-mxc-selfcheck-${process.pid}.txt`),
    );

    return {
      executor,
      label: `mxc（实验性，${support.isolationTier ?? "未知隔离等级"}，工作区映射为 ${mapping.drive}）`,
      warnings: [...(support.isolationWarnings ?? []), ...workspaceOwnerWarnings(workspaceRoot)],
    };
  } catch (error) {
    mapping.release();
    throw error;
  }
}
