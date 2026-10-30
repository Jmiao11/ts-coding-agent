import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

import {
  createInterface,
} from "node:readline/promises";

import {
  dirname,
} from "node:path";

import type {
  Readable,
  Writable,
} from "node:stream";

import {
  updateEnvFile,
} from "./env-file.js";

import {
  saveSetting,
  type Settings,
  type SettingKey,
} from "./settings.js";


export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

const CONNECT_TIMEOUT_MS = 15_000;
const MXC_SDK_MODULE = "@microsoft/mxc-sdk/v1";


export type SetupIO = {
  write(text: string): void;
  ask(prompt: string): Promise<string | null>;
  askSecret(prompt: string): Promise<string | null>;
};


export type SetupEnvValues = {
  apiKey: string;
  baseUrl: string;
  model: string;
};


export type SetupResult =
  | {
      status: "saved";
      env: SetupEnvValues;
      changed: SettingKey[];
    }
  | { status: "cancelled" }
  | { status: "declined" };


export type SetupOptions = {
  envFile: string;
  settingsPath: string;
  settings: Settings;
  currentEnv: Partial<SetupEnvValues>;
  io: SetupIO;
  fetchFn?: FetchLike;

  /** 测试或调用方已知可用沙箱时直接传入；不传就自动检测 */
  availableSandboxes?: readonly Settings["sandbox"][];
};


export type FetchLike = (
  url: string,
  init: RequestInit,
) => Promise<Response>;


type Choice = {
  value: string;
  description: string;
};


/**
 * 普通 readline 问答。secret 为 true 时暂时关闭 readline 的回显：
 * 提示语由这里自己写，输入过程不写任何字符，读完只补一个换行。
 */
export function createReadlineSetupIO(
  options: {
    input?: Readable;
    output?: Writable;
  } = {},
): SetupIO {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  function question(
    prompt: string,
    secret: boolean,
  ): Promise<string | null> {
    const rl = createInterface({
      input,
      output,
      terminal: true,
    });

    const internal = rl as unknown as {
      _writeToOutput?: (text: string) => void;
    };

    const originalWrite = internal._writeToOutput;
    const originalStreamWrite = output.write.bind(output);
    let muted = false;

    const mutedWrite = ((...args: unknown[]) => {
      if (!muted) {
        return (originalStreamWrite as (...writeArgs: unknown[]) => boolean)(...args);
      }

      const callback = typeof args[1] === "function"
        ? args[1]
        : typeof args[2] === "function"
          ? args[2]
          : undefined;

      if (typeof callback === "function") {
        callback();
      }

      return true;
    }) as typeof output.write;

    if (secret) {
      // 提示语先正常写出来；之后的按键回显全部丢掉。
      // 同时替换 _writeToOutput 和 output.write：不同 Node 版本的 readline
      // 走哪条路径不一样，两边都拦住才不会把 Key 打到屏幕上。
      originalStreamWrite(prompt);
      internal._writeToOutput = () => {};
      output.write = mutedWrite;
      muted = true;
    }

    let restored = false;

    const restore = (): void => {
      if (!secret || restored) {
        return;
      }

      restored = true;
      muted = false;
      output.write = originalStreamWrite as typeof output.write;

      if (originalWrite) {
        internal._writeToOutput = originalWrite;
      } else {
        delete internal._writeToOutput;
      }

      originalStreamWrite("\n");
    };

    return new Promise<string | null>((resolvePromise) => {
      let settled = false;

      const settle = (value: string | null): void => {
        if (!settled) {
          settled = true;
          resolvePromise(value);
        }
      };

      rl.on("SIGINT", () => {
        restore();
        settle(null);
        rl.close();
      });

      rl.once("close", () => {
        restore();
        settle(null);
      });

      rl.question(secret ? "" : prompt).then(
        (answer) => {
          restore();
          settle(answer);
          rl.close();
        },
        () => {
          restore();
          settle(null);
        },
      );
    });
  }

  return {
    write(text) {
      output.write(text);
    },

    ask(prompt) {
      return question(prompt, false);
    },

    askSecret(prompt) {
      return question(prompt, true);
    },
  };
}


/** host 一直可用；codex 看 AGENT_CODEX_EXE；mxc 看平台、Node 版本和 SDK */
export async function detectAvailableSandboxes(
  options: {
    platform?: NodeJS.Platform;
    nodeVersion?: string;
    env?: Record<string, string | undefined>;
    importModule?: (specifier: string) => Promise<unknown>;
  } = {},
): Promise<Settings["sandbox"][]> {
  const platform = options.platform ?? process.platform;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const env = options.env ?? process.env;
  const importModule = options.importModule
    ?? ((specifier: string) => import(specifier));

  const available: Settings["sandbox"][] = ["host"];
  const codexExe = env.AGENT_CODEX_EXE;

  if (codexExe && existsSync(codexExe)) {
    available.push("codex");
  }

  if (platform === "win32" && Number(nodeVersion.split(".")[0]) >= 24) {
    try {
      // 只确认能加载；不调用 getAvailableBackends()，它在某些路径下会 panic
      await importModule(MXC_SDK_MODULE);
      available.push("mxc");
    } catch {
      // 没装可选的 SDK：mxc 不可用
    }
  }

  return available;
}


function countCharacters(
  value: string,
): number {
  return Array.from(value).length;
}


function isHttpUrl(
  value: string,
): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}


function textOf(
  error: unknown,
): string {
  return error instanceof Error ? error.message : String(error);
}


function networkError(
  error: unknown,
): { ok: false; message: string } {
  if (
    error instanceof Error
    && (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return { ok: false, message: "连接超时（15 秒）。" };
  }

  return { ok: false, message: `网络错误：${textOf(error)}` };
}


function modelIds(
  body: unknown,
): string[] | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const data = (body as { data?: unknown }).data;

  if (!Array.isArray(data)) {
    return undefined;
  }

  return data.flatMap((item) => {
    if (
      typeof item === "object"
      && item !== null
      && typeof (item as { id?: unknown }).id === "string"
    ) {
      return [(item as { id: string }).id];
    }

    return [];
  });
}


async function testChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchFn: FetchLike;
}): Promise<{ ok: boolean; message: string }> {
  let response: Response;

  try {
    response = await options.fetchFn(
      `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      },
    );
  } catch (error) {
    return networkError(error);
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: `Key 无效（HTTP ${response.status}）。` };
  }

  if (response.ok) {
    return {
      ok: true,
      message: "连接成功（/models 返回 404，改用最小的 chat completion 测试）。",
    };
  }

  return {
    ok: false,
    message: `连接失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}。`,
  };
}


/** GET /models；404 时退回一次最小的 chat completion */
export async function testConnection(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchFn: FetchLike;
}): Promise<{ ok: boolean; message: string }> {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  let response: Response;

  try {
    response = await options.fetchFn(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    });
  } catch (error) {
    return networkError(error);
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: `Key 无效（HTTP ${response.status}）。` };
  }

  if (response.status === 404) {
    return testChatCompletion({
      baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      fetchFn: options.fetchFn,
    });
  }

  if (response.ok) {
    let body: unknown;

    try {
      body = await response.json();
    } catch {
      return {
        ok: true,
        message: "连接成功；无法从返回内容确认模型列表。",
      };
    }

    const ids = modelIds(body);

    if (ids === undefined) {
      return {
        ok: true,
        message: "连接成功；无法从返回内容确认模型列表。",
      };
    }

    return {
      ok: true,
      message: ids.includes(options.model)
        ? `连接成功；返回的模型列表里有 ${options.model}。`
        : `连接成功；返回的模型列表里没有 ${options.model}。`,
    };
  }

  return {
    ok: false,
    message: `连接失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}。`,
  };
}


async function askBaseUrl(
  io: SetupIO,
  current: string | undefined,
): Promise<string | null> {
  const existing = current?.trim() ?? "";
  const defaultPreset = existing === DEEPSEEK_BASE_URL
    ? "1"
    : existing
      ? "2"
      : "1";

  io.write("选择接口：\n");
  io.write(`  1) DeepSeek（${DEEPSEEK_BASE_URL}）\n`);
  io.write("  2) 其他 OpenAI 兼容接口\n");

  while (true) {
    const answer = await io.ask(`选择 [1/2]（默认 ${defaultPreset}）：`);

    if (answer === null) {
      return null;
    }

    const choice = answer.trim() === "" ? defaultPreset : answer.trim();

    if (choice === "1") {
      return DEEPSEEK_BASE_URL;
    }

    if (choice === "2") {
      const defaultUrl = existing !== "" && existing !== DEEPSEEK_BASE_URL
        ? existing
        : "";

      while (true) {
        const input = await io.ask(
          defaultUrl
            ? `Base URL（回车保留 ${defaultUrl}）：`
            : "Base URL：",
        );

        if (input === null) {
          return null;
        }

        const value = input.trim() || defaultUrl;

        if (isHttpUrl(value)) {
          return value;
        }

        io.write("Base URL 必须是 http(s) URL。\n");
      }
    }

    io.write("请输入 1 或 2。\n");
  }
}


async function askApiKey(
  io: SetupIO,
  current: string | undefined,
): Promise<string | null> {
  const existing = current !== undefined && current.length > 0
    ? current
    : undefined;

  const prompt = existing
    ? `API Key（已配置，${countCharacters(existing)} 个字符；回车保留）：`
    : "API Key：";

  while (true) {
    const input = await io.askSecret(prompt);

    if (input === null) {
      return null;
    }

    const key = input.trim() === ""
      ? existing
      : input;

    if (key === undefined || key.length === 0) {
      io.write("API Key 不能为空。\n");
      continue;
    }

    // 只显示长度，绝不显示 Key 本身
    io.write(`已输入 ${countCharacters(key)} 个字符。\n`);
    return key;
  }
}


async function askModel(
  io: SetupIO,
  current: string | undefined,
  deepSeek: boolean,
): Promise<string | null> {
  const existing = current?.trim() ?? "";
  const defaultValue = existing || (deepSeek ? "deepseek-flash" : "");

  while (true) {
    const input = await io.ask(
      defaultValue
        ? `模型 ID（回车保留 ${defaultValue}）：`
        : "模型 ID：",
    );

    if (input === null) {
      return null;
    }

    const model = input.trim() || defaultValue;

    if (model.length > 0) {
      return model;
    }

    io.write("模型 ID 不能为空。\n");
  }
}


async function askChoice(
  io: SetupIO,
  options: {
    title: string;
    current: string;
    choices: readonly Choice[];
    note?: string;
  },
): Promise<string | null> {
  const { choices } = options;

  if (choices.length === 0) {
    throw new Error(`${options.title} 没有可选项`);
  }

  const currentAvailable = choices.some(
    (choice) => choice.value === options.current,
  );

  const defaultValue = currentAvailable
    ? options.current
    : choices[0]!.value;

  const defaultIndex = choices.findIndex(
    (choice) => choice.value === defaultValue,
  ) + 1;

  io.write(`\n${options.title}（当前：${options.current}${currentAvailable ? "" : "，当前不可用"}）\n`);

  choices.forEach((choice, index) => {
    io.write(`  ${index + 1}) ${choice.value}：${choice.description}\n`);
  });

  if (options.note) {
    io.write(`${options.note}\n`);
  }

  while (true) {
    const answer = await io.ask(
      `选择 [1-${choices.length}]（${currentAvailable ? "回车保留" : "回车选择"} ${defaultValue}）：`,
    );

    if (answer === null) {
      return null;
    }

    const text = answer.trim();
    const index = text === "" ? defaultIndex : Number(text);

    if (
      Number.isInteger(index)
      && index >= 1
      && index <= choices.length
    ) {
      return choices[index - 1]!.value;
    }

    io.write(`请输入 1-${choices.length}。\n`);
  }
}


const SANDBOX_DESCRIPTIONS: Record<Settings["sandbox"], string> = {
  host: "命令直接在本机执行，没有隔离",
  codex: "通过 codex sandbox 执行（只支持 Windows）",
  mxc: "通过 Microsoft MXC 执行（实验性，只支持 Windows）",
};


function readEnvFile(
  path: string,
): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }
}


function writeEnvFile(
  path: string,
  text: string,
): void {
  const temporary = `${path}.${process.pid}.tmp`;
  const directory = dirname(path);

  // 目录已经存在时不要再 mkdir：Windows 上对盘符根目录（F:\）调用会 EPERM
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  try {
    writeFileSync(temporary, text, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // 临时文件可能还没创建
    }

    throw error;
  }

  if (process.platform !== "win32") {
    chmodSync(path, 0o600);
  }
}


export async function runSetupWizard(
  options: SetupOptions,
): Promise<SetupResult> {
  const { io } = options;
  const fetchFn = options.fetchFn
    ?? ((url: string, init: RequestInit) => fetch(url, init));

  io.write("\n首次运行设置\n\n");

  const baseUrl = await askBaseUrl(io, options.currentEnv.baseUrl);

  if (baseUrl === null) {
    return { status: "cancelled" };
  }

  const apiKey = await askApiKey(io, options.currentEnv.apiKey);

  if (apiKey === null) {
    return { status: "cancelled" };
  }

  const model = await askModel(
    io,
    options.currentEnv.model,
    baseUrl === DEEPSEEK_BASE_URL,
  );

  if (model === null) {
    return { status: "cancelled" };
  }

  io.write(`\n正在测试连接：${baseUrl}\n`);

  const tested = await testConnection({
    baseUrl,
    apiKey,
    model,
    fetchFn,
  });

  io.write(`${tested.ok ? "✓" : "✗"} ${tested.message}\n`);

  if (!tested.ok) {
    const answer = await io.ask("仍然保存吗？[y/N] ");

    if (answer === null) {
      return { status: "cancelled" };
    }

    const save = answer.trim().toLowerCase();

    if (save !== "y" && save !== "yes") {
      io.write("未保存。\n");
      return { status: "declined" };
    }
  }

  // 连通测试和「仍然保存」确认都通过后才写文件
  let before: string;

  try {
    before = readEnvFile(options.envFile);
  } catch (error) {
    io.write(`无法读取 ${options.envFile}：${textOf(error)}\n`);
    return { status: "declined" };
  }

  let updated: string;

  try {
    updated = updateEnvFile(before, {
      AGENT_BASE_URL: baseUrl,
      AGENT_API_KEY: apiKey,
      AGENT_MODEL: model,
    });
  } catch (error) {
    io.write(`无法更新 env 文件：${textOf(error)}\n`);
    return { status: "declined" };
  }

  try {
    writeEnvFile(options.envFile, updated);
  } catch (error) {
    io.write(`无法写入 ${options.envFile}：${textOf(error)}\n`);
    return { status: "declined" };
  }

  io.write(`\nenv 文件已写入：${options.envFile}\n`);

  const availableSandboxes = options.availableSandboxes
    ?? await detectAvailableSandboxes();

  const changed: SettingKey[] = [];

  const ui = await askChoice(io, {
    title: "界面 ui",
    current: options.settings.ui,
    choices: [
      { value: "tui", description: "全屏交互界面（只在交互式终端里生效）" },
      { value: "plain", description: "普通逐行输出" },
    ],
  });

  if (ui === null) {
    return { status: "cancelled" };
  }

  if (ui !== options.settings.ui) {
    try {
      saveSetting(options.settingsPath, "ui", ui as Settings["ui"]);
      changed.push("ui");
    } catch (error) {
      io.write(`保存 ui 失败：${textOf(error)}\n`);
    }
  }

  const sandbox = await askChoice(io, {
    title: "沙箱 sandbox",
    current: options.settings.sandbox,
    choices: availableSandboxes.map((value) => ({
      value,
      description: SANDBOX_DESCRIPTIONS[value],
    })),
    note: "所选的沙箱如果启动失败，Agent 会拒绝运行，不会退回本机执行。",
  });

  if (sandbox === null) {
    return { status: "cancelled" };
  }

  if (sandbox !== options.settings.sandbox) {
    try {
      saveSetting(options.settingsPath, "sandbox", sandbox as Settings["sandbox"]);
      changed.push("sandbox");
    } catch (error) {
      io.write(`保存 sandbox 失败：${textOf(error)}\n`);
    }
  }

  const nonGitDirectory = await askChoice(io, {
    title: "非 Git 目录 nonGitDirectory",
    current: options.settings.nonGitDirectory,
    choices: [
      { value: "ask", description: "启动时询问怎么处理" },
      { value: "init", description: "自动执行 git init" },
      { value: "allow", description: "不用 Git 直接运行（每次启动警告）" },
    ],
  });

  if (nonGitDirectory === null) {
    return { status: "cancelled" };
  }

  if (nonGitDirectory !== options.settings.nonGitDirectory) {
    try {
      saveSetting(
        options.settingsPath,
        "nonGitDirectory",
        nonGitDirectory as Settings["nonGitDirectory"],
      );
      changed.push("nonGitDirectory");
    } catch (error) {
      io.write(`保存 nonGitDirectory 失败：${textOf(error)}\n`);
    }
  }

  io.write("\n设置完成。\n");
  io.write(`env 文件：${options.envFile}\n`);
  io.write(`Base URL：${baseUrl}\n`);
  io.write(`模型：${model}\n`);
  io.write(`API Key：已保存（${countCharacters(apiKey)} 个字符）\n`);
  io.write(`config.json：${changed.length > 0 ? changed.join("、") : "未修改"}\n`);

  return {
    status: "saved",
    env: { apiKey, baseUrl, model },
    changed,
  };
}
