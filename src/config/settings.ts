import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";

import {
  dirname,
} from "node:path";


/**
 * 每个设置项能取哪些值。类型从这里推出来，新增设置项只改这一处。
 * `as const` 让 TypeScript 把数组记成具体的字面量（"tui" | "plain"），而不是 string[]。
 */
export const SETTING_CHOICES = {
  ui: ["tui", "plain"],
  sandbox: ["host", "codex", "mxc"],
  nonGitDirectory: ["ask", "init", "allow"],
} as const;

export type SettingKey = keyof typeof SETTING_CHOICES;

/** { ui: "tui" | "plain"; sandbox: "host" | "codex" | "mxc"; nonGitDirectory: "ask" | "init" | "allow" } */
export type Settings = {
  [K in SettingKey]: (typeof SETTING_CHOICES)[K][number];
};

export const DEFAULT_SETTINGS: Settings = {
  ui: "tui",
  sandbox: "host",
  nonGitDirectory: "ask",
};


export function isSettingKey(
  key: string,
): key is SettingKey {
  return Object.hasOwn(SETTING_CHOICES, key);
}


export function isSettingValue<K extends SettingKey>(
  key: K,
  value: unknown,
): value is Settings[K] {
  return (SETTING_CHOICES[key] as readonly unknown[]).includes(value);
}


/**
 * 解析设置文件的内容。文件是用户手写的：认识的项要校验，不认识的跳过并警告，
 * 任何问题都不会抛错，最坏的情况是全部用默认值。
 */
export function parseSettings(
  text: string,
): { settings: Partial<Settings>; warnings: string[]; broken: boolean } {
  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch {
    return { settings: {}, warnings: ["设置文件不是合法的 JSON，全部使用默认值"], broken: true };
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { settings: {}, warnings: ["设置文件应该是一个 JSON 对象，全部使用默认值"], broken: true };
  }

  const settings: Partial<Settings> = {};
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (!isSettingKey(key)) {
      warnings.push(`不认识的设置项 ${key}，已忽略`);
      continue;
    }

    if (!isSettingValue(key, value)) {
      warnings.push(`${key} 只能是 ${SETTING_CHOICES[key].join(" / ")}，收到 ${JSON.stringify(value)}，使用默认值`);
      continue;
    }

    // 这里 key 是联合类型，TypeScript 没法证明 value 和 key 对应，所以用一次断言
    (settings as Record<SettingKey, unknown>)[key] = value;
  }

  return { settings, warnings, broken: false };
}


/** 读设置文件。文件不存在是正常情况（还没设置过） */
export function loadSettings(
  path: string,
): { settings: Partial<Settings>; warnings: string[]; broken: boolean } {
  let text: string;

  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { settings: {}, warnings: [], broken: false };
    }

    throw error;
  }

  return parseSettings(text);
}


/**
 * 合并多层设置，后面的覆盖前面的：
 *   resolveSettings(文件里的, 命令行参数) → 命令行参数 > 文件 > 默认值
 * 只覆盖真正给了值的项：undefined 表示「这一层没说」。
 */
export function resolveSettings(
  ...layers: Partial<Settings>[]
): Settings {
  const result: Settings = { ...DEFAULT_SETTINGS };

  for (const layer of layers) {
    for (const key of Object.keys(SETTING_CHOICES) as SettingKey[]) {
      const value = layer[key];

      if (value !== undefined) {
        (result as Record<SettingKey, unknown>)[key] = value;
      }
    }
  }

  return result;
}


/**
 * 改一项设置并写回文件。先写临时文件再改名：写到一半进程被杀，原文件也不会变成半个 JSON。
 * 只写用户改过的项，不把默认值写进去：以后默认值变了，没改过的人自动跟着变。
 */
export function saveSetting<K extends SettingKey>(
  path: string,
  key: K,
  value: Settings[K],
): void {
  const { settings, broken } = loadSettings(path);

  // 文件整个读不懂时不能覆盖：用户手写的内容（哪怕有个逗号写错）会全部丢掉
  if (broken) {
    throw new Error(`设置文件 ${path} 不是合法的 JSON 对象。为了不覆盖你的内容，没有保存；请先修好或删掉它。`);
  }

  const next = { ...settings, [key]: value };
  const temporary = `${path}.${process.pid}.tmp`;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}