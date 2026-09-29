import type {
  AgentExtension,
} from "../agent/extension.js";

import type {
  BeforeToolCallResult,
} from "../agent/hooks.js";


export type ApproveCommand =
  (command: string) => Promise<boolean>;


export const DEFAULT_ALLOWED_COMMANDS = [
  "pnpm test",
  "pnpm typecheck",
  "pnpm build",
  "git status",
  "git diff",
  "git log",
  "git show",
];


// 能串联命令、重定向、展开变量的字符：出现任何一个都必须确认
const SHELL_METACHARACTERS = /[;&|<>`$()^%\r\n]/;


export function isAllowedCommand(
  command: string,
  allowed: readonly string[],
): boolean {
  if (SHELL_METACHARACTERS.test(command)) {
    return false;
  }

  const normalized =
    command.trim().replace(/\s+/g, " ");

  // git diff / log / show 的 --output 会写文件
  if (/--output\b/.test(normalized)) {
    return false;
  }

  return allowed.some(
    (prefix) =>
      normalized === prefix
      || normalized.startsWith(`${prefix} `),
  );
}


/**
 * 白名单之外的 run_command 需要人工确认。
 *
 * 不是安全隔离：白名单里的 pnpm test 会执行测试文件，
 * 模型可以先写文件再执行。它防的是意外，并让命令可见。
 */
export function createCommandApprovalExtension(
  options: {
    approve: ApproveCommand;
    allowed?: readonly string[];
  },
): AgentExtension {
  const allowed =
    options.allowed ?? DEFAULT_ALLOWED_COMMANDS;

  return {
    name: "command-approval",

    hooks: {
      async beforeToolCall({
        toolCall,
      }): Promise<BeforeToolCallResult | undefined> {
        if (toolCall.name !== "run_command") {
          return undefined;
        }

        // beforeToolCall 在参数校验之前运行，不能假设 command 是 string
        const command =
          toolCall.arguments.command;

        if (typeof command !== "string") {
          return undefined;
        }

        if (isAllowedCommand(command, allowed)) {
          return undefined;
        }

        if (await options.approve(command)) {
          return undefined;
        }

        return {
          block: true,
          reason:
            `The user rejected this command: ${command}. Do not retry it; use another approach or explain what you need.`,
        };
      },
    },
  };
}
