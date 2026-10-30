import {
  posix,
  win32,
} from "node:path";


export type NonGitPolicy = "ask" | "init" | "allow";


/** 判断「受保护目录」要用到的环境信息。测试里直接传，所以 Windows 的规则在 Linux 上也能测 */
export type PathRules = {
  platform: NodeJS.Platform;
  home: string;

  /** 系统目录：它们本身和它们下面的目录都受保护 */
  systemDirectories: string[];
};


/** 当前机器的规则 */
export function currentPathRules(
  env: Record<string, string | undefined>,
  home: string,
  platform: NodeJS.Platform = process.platform,
): PathRules {
  const systemDirectories =
    platform === "win32"
      ? [env.SystemRoot, env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramData]
      : ["/bin", "/boot", "/dev", "/etc", "/lib", "/proc", "/sbin", "/sys", "/usr", "/var"];

  return {
    platform,
    home,
    systemDirectories: systemDirectories.filter((path): path is string => Boolean(path)),
  };
}


/**
 * 统一成可以直接比较的形式：绝对路径、去掉末尾的分隔符，Windows 上不分大小写。
 * 这里只处理写法，不访问磁盘：8.3 短路径、符号链接要由调用方先用 realpath 展开。
 */
function comparable(
  path: string,
  platform: NodeJS.Platform,
): string {
  const paths = platform === "win32" ? win32 : posix;
  let resolved = paths.resolve(path);

  // C:\ 和 / 本身要保留末尾的分隔符
  if (resolved.length > paths.parse(resolved).root.length) {
    resolved = resolved.replace(/[\\/]+$/, "");
  }

  return platform === "win32" ? resolved.toLowerCase() : resolved;
}


/** parent 是不是 child 本身或者它的上级目录 */
function contains(
  parent: string,
  child: string,
  platform: NodeJS.Platform,
): boolean {
  const separator = platform === "win32" ? "\\" : "/";
  const prefix = parent.endsWith(separator) ? parent : parent + separator;

  return child === parent || child.startsWith(prefix);
}


/**
 * 这个目录是不是不适合当工作区，不适合的话返回原因。
 * 在这些地方 git init，会把整块磁盘或整个用户目录变成一个仓库；不用 Git 直接运行，Agent 能改到的范围又太大。
 */
export function protectedDirectoryReason(
  directory: string,
  rules: PathRules,
): string | undefined {
  const { platform } = rules;
  const paths = platform === "win32" ? win32 : posix;
  const target = comparable(directory, platform);
  const home = comparable(rules.home, platform);

  if (target === comparable(paths.parse(target).root, platform)) {
    return "磁盘根目录";
  }

  if (target === home) {
    return "用户主目录";
  }

  // 比如 C:\Users：它下面是所有用户的主目录
  if (contains(target, home, platform)) {
    return "用户主目录的上级目录";
  }

  for (const system of rules.systemDirectories) {
    if (contains(comparable(system, platform), target, platform)) {
      return "系统目录";
    }
  }

  return undefined;
}


export type NonGitDecision =
  | { action: "init" }
  | { action: "allow" }
  | { action: "ask"; canInit: boolean }
  | { action: "refuse"; reason: string };


/**
 * 工作区不在 Git 仓库里时怎么办。只做决定，不执行：git init、询问用户都由 cli 来做。
 *
 * 受保护的目录不管设置是什么，都不会不声不响地运行：能问就问（而且不提供 git init），不能问就拒绝。
 */
export function decideNonGitWorkspace(options: {
  policy: NonGitPolicy;
  interactive: boolean;
  gitInstalled: boolean;
  protectedReason: string | undefined;
}): NonGitDecision {
  const { policy, interactive, gitInstalled, protectedReason } = options;
  const canInit = gitInstalled && protectedReason === undefined;

  if (protectedReason !== undefined) {
    return interactive
      ? { action: "ask", canInit: false }
      : { action: "refuse", reason: `工作区是${protectedReason}，不在这里运行。请换到一个项目目录。` };
  }

  if (policy === "allow") {
    return { action: "allow" };
  }

  if (policy === "init" && canInit) {
    return { action: "init" };
  }

  if (interactive) {
    return { action: "ask", canInit };
  }

  return {
    action: "refuse",
    reason: !gitInstalled
      ? "没有找到 git，也没法询问你怎么处理（非交互模式）。"
        + "可以安装 git，或者运行 ts-coding-agent config set nonGitDirectory allow 允许不用 Git 运行。"
      : "工作区不在 Git 仓库里，非交互模式下没法询问你怎么处理。"
        + "可以先运行 git init，或者运行 ts-coding-agent config set nonGitDirectory init（自动初始化）或 allow（不用 Git 运行）。",
  };
}