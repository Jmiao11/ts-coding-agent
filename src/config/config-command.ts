import {
  SETTING_CHOICES,
  isSettingKey,
  isSettingValue,
  type SettingKey,
} from "./settings.js";


const SETTING_KEYS =
  Object.keys(SETTING_CHOICES) as SettingKey[];


export const CONFIG_USAGE = `config 子命令：
  ts-coding-agent config list                 显示每项设置、来源和可选值
  ts-coding-agent config get <key>            显示一项设置
  ts-coding-agent config set <key> <value>    校验后保存一项设置
  ts-coding-agent config path                 显示设置文件的路径

设置项：ui（tui / plain）、sandbox（host / codex / mxc）、
        nonGitDirectory（ask / init / allow；目前只保存，不影响运行）
如果任务本身就叫 "config"，用 -- 隔开：ts-coding-agent -- config`;


export type ConfigCommand =
  | { action: "list" }
  | { action: "get"; key: SettingKey }
  | { action: "set"; key: SettingKey; value: string }
  | { action: "path" };


export type ConfigCommandResult =
  | { command: ConfigCommand }
  | { error: string };


/**
 * 解析 "config" 后面的参数。纯函数：不读写文件，方便测试。
 * key 和 value 的校验也放在这里，命令行和测试看到同一套错误。
 */
export function parseConfigCommand(
  args: readonly string[],
): ConfigCommandResult {
  const [name, ...rest] = args;

  if (name === undefined) {
    return { error: `config 需要一个子命令。\n\n${CONFIG_USAGE}` };
  }

  switch (name) {
    case "list":
      if (rest.length > 0) {
        return { error: "config list 不接受参数。" };
      }
      return { command: { action: "list" } };

    case "path":
      if (rest.length > 0) {
        return { error: "config path 不接受参数。" };
      }
      return { command: { action: "path" } };

    case "get": {
      const key = rest[0];

      if (key === undefined) {
        return {
          error: `config get 需要设置项。可用的设置项：${SETTING_KEYS.join("、")}。`,
        };
      }

      if (rest.length > 1) {
        return { error: "config get 只接受一个设置项。" };
      }

      if (!isSettingKey(key)) {
        return {
          error: `不认识的设置项 ${key}。可用的设置项：${SETTING_KEYS.join("、")}。`,
        };
      }

      return { command: { action: "get", key } };
    }

    case "set": {
      const key = rest[0];
      const value = rest[1];

      if (key === undefined || value === undefined) {
        return {
          error: `config set 需要设置项和值，例如：config set ui plain。可用的设置项：${SETTING_KEYS.join("、")}。`,
        };
      }

      if (rest.length > 2) {
        return { error: "config set 只接受设置项和一个值。" };
      }

      if (!isSettingKey(key)) {
        return {
          error: `不认识的设置项 ${key}。可用的设置项：${SETTING_KEYS.join("、")}。`,
        };
      }

      if (!isSettingValue(key, value)) {
        return {
          error: `${key} 只能是 ${SETTING_CHOICES[key].join(" / ")}（收到：${value}）。`,
        };
      }

      return { command: { action: "set", key, value } };
    }

    default:
      return {
        error: `未知的 config 子命令：${name}。\n\n${CONFIG_USAGE}`,
      };
  }
}
