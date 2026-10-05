import type {
  AgentMessage,
  StreamFn,
} from "../agent/types.js";

import type {
  AssistantMessage,
  Context,
  Model,
  TextContent,
  ToolCall,
  Usage,
  UserMessage,
} from "../ai/types.js";

import {
  estimateContextTokens,
  estimateMessageTokens,
  textOf,
} from "./token-estimate.js";


// ---------- 切点 ----------

export type CutPoint = {
  /**最终确定的近期消息起点 */
  firstKeptIndex: number;

  /**
   * 被切开的那一轮的起始 user 消息下标（原样保留）。
   * 切点本身就是 user 消息（没有切开一轮）时为 -1。
   */
  turnStartIndex: number;
};


/**
 * 合法切点：user 或 assistant 消息。
 * 绝不停在 toolResult 上：它必须跟着自己的 toolCall。
 * 停在带 toolCall 的 assistant 上时，它的 toolResult 在后面，会一起保留。
 */
function isCutPoint(
  message: AgentMessage,
): boolean {
  return (
    message.role === "user"
    || message.role === "assistant"
  );
}


/**
 * 从最新的消息往前累加估算的 token，
 * 凑够 keepRecentTokens 后，在最近的合法切点处切开。
 *
 * startIndex：这次最早可以总结到哪（多次压缩时是上一次的 firstKeptIndex）。
 * 返回的 firstKeptIndex <= startIndex 表示没什么可压缩的。
 */
export function findCutPoint(
  messages: AgentMessage[],
  startIndex: number,
  keepRecentTokens: number,
): CutPoint {
  let accumulated = 0;
  let firstKeptIndex = startIndex;

  for (let index = messages.length - 1; index >= startIndex; index -= 1) {
    const message = messages[index];

    if (!message) {
      continue;
    }

    accumulated += estimateMessageTokens(message);

    if (accumulated < keepRecentTokens) {
      continue;
    }

    // 优先往后找：保留的量尽量贴近预算
    let cut = index;

    while (
      cut < messages.length
      && !isCutPoint(messages[cut] as AgentMessage)
    ) {
      cut += 1;
    }

    // 后面找不到（结尾全是 toolResult）就往前找：多留一点，也不能切在 toolResult 上
    if (cut >= messages.length) {
      cut = index;

      while (
        cut > startIndex
        && !isCutPoint(messages[cut] as AgentMessage)
      ) {
        cut -= 1;
      }
    }

    firstKeptIndex = cut;
    break;
  }

  const kept = messages[firstKeptIndex];

  if (!kept || kept.role === "user") {
    return {
      firstKeptIndex,
      turnStartIndex: -1,
    };
  }

  // 切在一轮中间：找到这一轮开头的 user 消息
  let turnStartIndex = -1;

  for (let index = firstKeptIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      turnStartIndex = index;
      break;
    }
  }

  return {
    firstKeptIndex,
    turnStartIndex,
  };
}


// ---------- 序列化 ----------

/** 每一块内容序列化时的字符上限（Pi 对工具结果用的是 2000） */
const MAX_BLOCK_CHARS = 2000;


function clip(
  text: string,
): string {
  if (text.length <= MAX_BLOCK_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_BLOCK_CHARS)}\n[... ${text.length - MAX_BLOCK_CHARS} more characters truncated]`;
}


/**
 * 把消息序列化成纯文本，交给模型总结。
 *
 * 序列化而不是直接把消息发过去：
 * 否则模型会把它当成对话接着往下写，而不是总结它。
 */
export function serializeConversation(
  messages: AgentMessage[],
): string {
  const blocks: string[] = [];

  for (const message of messages) {
    switch (message.role) {
      case "system":
        blocks.push(`[System]: ${clip(message.content)}`);
        break;

      case "user":
        blocks.push(`[User]: ${clip(textOf(message.content))}`);
        break;

      case "assistant": {
        const text = message.content
          .filter((item): item is TextContent => item.type === "text")
          .map((item) => item.text)
          .join("");

        if (text.length > 0) {
          blocks.push(`[Assistant]: ${clip(text)}`);
        }

        const calls = message.content
          .filter((item): item is ToolCall => item.type === "toolCall")
          .map((call) => `${call.name}(${JSON.stringify(call.arguments)})`);

        if (calls.length > 0) {
          blocks.push(`[Assistant tool calls]: ${clip(calls.join("; "))}`);
        }

        break;
      }

      case "toolResult":
        blocks.push(
          `[${message.isError ? "Tool error" : "Tool result"}] ${message.toolName}: ${clip(textOf(message.content))}`,
        );
        break;
    }
  }

  return blocks.join("\n\n");
}



// ---------- 压缩器 ----------

export type CompactionSettings = {
  /** 模型的上下文窗口 */
  contextWindow: number;

  /** 给模型回答预留的空间（Pi 默认 16384） */
  reserveTokens: number;

  /** 压缩后保留原文的最近消息量（Pi 默认 20000） */
  keepRecentTokens: number;

  /** 写进 prompt 的总结目标（软约束），默认 0.4 × reserveTokens */
  maxSummaryTokens?: number;

  /** 总结请求的输出上限（max_tokens），默认 0.8 × reserveTokens */
  maxSummaryOutputTokens?: number;
};


/**
 * 可序列化的压缩状态。
 * 下标指向完整 transcript，Session 层负责与条目 ID 换算。
 */
export type CompactionCheckpoint = {
  modelSummary: string;
  firstKeptIndex: number;

  /** -1 表示没有需要原样保留的起始 user 消息 */
  turnStartIndex: number;

  /** 压缩时 transcript 长度，此下标起的 usage 才可信 */
  trustUsageFrom: number;

  readFiles: string[];
  modifiedFiles: string[];
};


export type CompactionEvent = {
  tokensBefore: number;
  estimatedTokensAfter: number;
  summarizedMessages: number;
  keptMessages: number;
  /** 模型写的总结（不含文件列表） */
  summary: string;
  /** 总结请求次数：1 = 一次成功；2 = 第一次被截断，重试后成功 */
  attempts: number;
  usage?: Usage;
  /** 压缩后的状态，交给 Session 持久化 */
  checkpoint: CompactionCheckpoint;
};


export type CompactorOptions = {
  model: Model;
  streamFn: StreamFn;
  settings: CompactionSettings;
  /** 每次调用模型前报告估算值，用来和随后真实的 in= 对照 */
  onEstimate?: (tokens: number, threshold: number) => void;
  onCompaction?: (event: CompactionEvent) => void;
  onError?: (error: unknown) => void;

  /** 从 Session 恢复时传入 */
  initialCheckpoint?: CompactionCheckpoint | undefined;
};


/** 压缩成功会调用 onCompaction；失败会调用 onError。 */
export type CompactResult =
  | { status: "compacted"; event: CompactionEvent }
  | { status: "nothing" }
  | { status: "failed"; error: unknown };


export type Compactor = {
  transformContext(
    messages: AgentMessage[],
    signal?: AbortSignal,
  ): Promise<AgentMessage[]>;

  /** 跳过阈值检查，使用与自动压缩相同的切点规则。 */
  compact(
    messages: AgentMessage[],
    options?: {
      signal?: AbortSignal | undefined;
      customInstructions?: string | undefined;
    },
  ): Promise<CompactResult>;
};


type CompactionState = {
  /** 模型写的总结（不含文件列表），下次压缩时作为 previous-summary */
  modelSummary: string;

  /** 放进视图的总结消息：每次压缩只生成一次，保持同一个对象 */
  summaryMessage: UserMessage;

  firstKeptIndex: number;
  turnStartIndex: number;

  /** 压缩时 transcript 的长度：只有这之后的 usage 可信 */
  trustUsageFrom: number;

  readFiles: Set<string>;
  modifiedFiles: Set<string>;
};


const SUMMARIZER_SYSTEM_PROMPT =
  "You write context checkpoints for a coding agent. You are given a transcript of earlier work. Do not continue the conversation and do not call tools. Output only the checkpoint.";

const CHECKPOINT_SECTIONS = `## Goal
## Constraints & Preferences
## Progress
### Done
### In Progress
### Blocked
## Key Decisions
## Next Steps
## Critical Context`;

// C4 真实运行发现的两个问题：
// 1. 只记了"读过哪些文件"，没记"每个文件是做什么的"这类已得出的结论
// 2. 把序列化时加的截断标记，误当成"文件没读完、需要补读"
const CHECKPOINT_RULES = `Record findings and intermediate results the agent has already produced (for example, what each file it read does), not just which files were read: after this checkpoint the original tool outputs are no longer visible.
Tool outputs inside <conversation> may be shortened for this summary request only (marked "[... N more characters truncated]"). Do not conclude from these markers that the agent saw incomplete content or needs to re-read a file.
Keep exact file paths, function names, commands and error messages. The original request stays in the context verbatim, so do not copy it. Write in the same language as the original request.`;

const SUMMARY_INSTRUCTIONS = `Write a structured checkpoint of the work in <conversation> that another model will use to continue the task. Use exactly these sections:

${CHECKPOINT_SECTIONS}

Be concise.
${CHECKPOINT_RULES}`;

const UPDATE_INSTRUCTIONS = `<conversation> contains NEW messages. Update the checkpoint in <previous-summary>: keep what is still relevant, add new progress, findings and decisions, move finished items to Done, and refresh Next Steps. Use the same sections:

${CHECKPOINT_SECTIONS}

${CHECKPOINT_RULES}`;


const READ_TOOLS = new Set(["read_file"]);
const WRITE_TOOLS = new Set(["write_file", "edit_file"]);


function collectFiles(
  messages: AgentMessage[],
  readFiles: Set<string>,
  modifiedFiles: Set<string>,
): void {
  // 先收集成功执行的工具调用 ID。
  const succeeded = new Set<string>();

  for (const message of messages) {
    if (message.role === "toolResult" && !message.isError) {
      succeeded.add(message.toolCallId);
    }
  }

  // 再找到这些调用，从参数中提取文件路径。
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const item of message.content) {
      if (item.type !== "toolCall" || !succeeded.has(item.id)) {
        continue;
      }

      const path = item.arguments.path;

      if (typeof path !== "string") {
        continue;
      }

      if (READ_TOOLS.has(item.name)) {
        readFiles.add(path);
      }

      if (WRITE_TOOLS.has(item.name)) {
        modifiedFiles.add(path);
      }
    }
  }
}


function createSummaryMessage(
  input: {
    modelSummary: string;
    readFiles: Set<string>;
    modifiedFiles: Set<string>;
  },
): UserMessage {
  const modified = [...input.modifiedFiles];

  const read = [...input.readFiles].filter(
    (path) => !input.modifiedFiles.has(path),
  );

  const parts = [
    "The earlier part of this task was compacted to save context. Below is a checkpoint of the work so far; the most recent messages follow it unchanged.",
    `<summary>\n${input.modelSummary}\n</summary>`,
  ];

  if (read.length > 0) {
    parts.push(`<read-files>\n${read.join("\n")}\n</read-files>`);
  }

  if (modified.length > 0) {
    parts.push(`<modified-files>\n${modified.join("\n")}\n</modified-files>`);
  }

  parts.push(
    "File contents shown before this point are no longer visible. Read a file again before editing it.",
  );

  return {
    role: "user",
    content: parts.join("\n\n"),
    timestamp: Date.now(),
  };
}


function stateFromCheckpoint(
  checkpoint: CompactionCheckpoint,
): CompactionState {
  const readFiles = new Set(checkpoint.readFiles);
  const modifiedFiles = new Set(checkpoint.modifiedFiles);

  return {
    modelSummary: checkpoint.modelSummary,
    summaryMessage: createSummaryMessage({
      modelSummary: checkpoint.modelSummary,
      readFiles,
      modifiedFiles,
    }),
    firstKeptIndex: checkpoint.firstKeptIndex,
    turnStartIndex: checkpoint.turnStartIndex,
    trustUsageFrom: checkpoint.trustUsageFrom,
    readFiles,
    modifiedFiles,
  };
}


function checkpointOf(
  state: CompactionState,
): CompactionCheckpoint {
  return {
    modelSummary: state.modelSummary,
    firstKeptIndex: state.firstKeptIndex,
    turnStartIndex: state.turnStartIndex,
    trustUsageFrom: state.trustUsageFrom,
    readFiles: [...state.readFiles],
    modifiedFiles: [...state.modifiedFiles],
  };
}


function sumTokens(
  messages: AgentMessage[],
): number {
  return messages.reduce(
    (sum, message) => sum + estimateMessageTokens(message),
    0,
  );
}


function addUsage(
  total: Usage | undefined,
  next: Usage,
): Usage {
  if (!total) {
    return next;
  }

  const hasCache =
    total.cacheRead !== undefined
    || next.cacheRead !== undefined;

  return {
    input: total.input + next.input,
    output: total.output + next.output,
    ...(hasCache
      ? { cacheRead: (total.cacheRead ?? 0) + (next.cacheRead ?? 0) }
      : {}),
  };
}


export function createCompactor(
  options: CompactorOptions,
): Compactor {
  const { model, streamFn, settings } = options;

  const maxSummaryOutputTokens =
    settings.maxSummaryOutputTokens
    ?? Math.floor(0.8 * settings.reserveTokens);

  const maxSummaryTokens =
    settings.maxSummaryTokens
    ?? Math.floor(0.4 * settings.reserveTokens);

  let state: CompactionState | undefined =
    options.initialCheckpoint
      ? stateFromCheckpoint(options.initialCheckpoint)
      : undefined;


  function buildView(
    messages: AgentMessage[],
  ): AgentMessage[] {
    const current = state;

    if (!current) {
      return messages;
    }

    const pinned =
      current.turnStartIndex >= 0
        ? messages[current.turnStartIndex]
        : undefined;

    return [
      ...(pinned ? [pinned] : []),
      current.summaryMessage,
      ...messages.slice(current.firstKeptIndex),
    ];
  }


  function estimateCurrent(
    messages: AgentMessage[],
    view: AgentMessage[],
  ): number {
    const trusted = estimateContextTokens(
      messages,
      state?.trustUsageFrom ?? 0,
    );

    if (!state || trusted.usageTokens > 0) {
      return trusted.tokens;
    }

    // 压缩后还没有新的模型调用：
    // 保留消息里的 usage 都是按压缩前的大 Context 统计的，不可信，全部按字符估算
    return sumTokens(view);
  }


  async function summarize(
    messages: AgentMessage[],
    originalRequest: string | undefined,
    previousSummary: string | undefined,
    signal: AbortSignal | undefined,
    customInstructions: string | undefined,
  ): Promise<{ text: string; attempts: number; usage?: Usage }> {
    const parts: string[] = [];

    if (originalRequest !== undefined) {
      parts.push(`<original-request>\n${originalRequest}\n</original-request>`);
    }

    parts.push(`<conversation>\n${serializeConversation(messages)}\n</conversation>`);

    if (previousSummary !== undefined) {
      parts.push(`<previous-summary>\n${previousSummary}\n</previous-summary>`);
    }

    parts.push(
      previousSummary !== undefined
        ? UPDATE_INSTRUCTIONS
        : SUMMARY_INSTRUCTIONS,
    );

    if (customInstructions !== undefined) {
      parts.push(
        `Additional instructions from the user for this checkpoint:\n${customInstructions}`,
      );
    }

    parts.push(
      `Keep the checkpoint under about ${maxSummaryTokens} tokens. Prioritize findings and remaining work; compress older details when updating.`,
    );

    let totalUsage: Usage | undefined;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const prompt =
        attempt === 1
          ? parts.join("\n\n")
          : `${parts.join("\n\n")}\n\nYour previous checkpoint was cut off at the output limit. Write a much shorter one: at most about ${Math.floor(maxSummaryTokens / 2)} tokens, one short line per item.`;

      // 不带 tools：总结请求不应该调用工具
      const context: Context = {
        systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: prompt,
            timestamp: Date.now(),
          },
        ],
      };

      const stream = await streamFn(
        model,
        context,
        {
          maxTokens: maxSummaryOutputTokens,
          ...(signal ? { signal } : {}),
        },
      );

      let final: AssistantMessage | undefined;

      for await (const event of stream) {
        if (event.type === "done") {
          final = event.message;
        } else if (event.type === "error") {
          final = event.error;
        }
      }

      if (final?.usage) {
        totalUsage = addUsage(totalUsage, final.usage);
      }

      if (
        !final
        || final.stopReason === "error"
        || final.stopReason === "aborted"
      ) {
        throw new Error(
          `Summarization failed: ${final?.errorMessage ?? "no response"}`,
        );
      }

      // 被截断的总结不完整，不能当检查点；先带着"写短一点"重试一次
      if (final.stopReason === "length") {
        if (attempt === 1) {
          continue;
        }

        throw new Error(
          "Summarization hit the output limit twice; the summary would be incomplete.",
        );
      }

      const text = final.content
        .filter((item): item is TextContent => item.type === "text")
        .map((item) => item.text)
        .join("")
        .trim();

      if (text.length === 0) {
        throw new Error("Summarization returned an empty summary.");
      }

      return {
        text,
        attempts: attempt,
        ...(totalUsage ? { usage: totalUsage } : {}),
      };
    }

    throw new Error("Summarization failed: no attempt succeeded.");
  }


  /** 自动和手动压缩共用：总结 [上次保留起点, 新切点) 这一段。 */
  async function compactNow(
    messages: AgentMessage[],
    tokensBefore: number,
    signal: AbortSignal | undefined,
    customInstructions: string | undefined,
  ): Promise<CompactResult> {
    const startIndex = state?.firstKeptIndex ?? 0;

    const cut = findCutPoint(
      messages,
      startIndex,
      settings.keepRecentTokens,
    );

    if (cut.firstKeptIndex <= startIndex) {
      return { status: "nothing" };
    }

    // 被切开那一轮的开头 user 消息原样保留，不进总结
    const range = messages
      .slice(startIndex, cut.firstKeptIndex)
      .filter((_, offset) => startIndex + offset !== cut.turnStartIndex);

    // 多轮之后：上次原样保留的（更早一轮的）任务这次不再保留。
    // 它不在新视图里，上次的总结也被告知不要复制它，所以必须放进这次的总结。
    const previousPinned = state?.turnStartIndex ?? -1;

    const droppedPin =
      previousPinned >= 0 && previousPinned !== cut.turnStartIndex
        ? messages[previousPinned]
        : undefined;

    const toSummarize = droppedPin
      ? [droppedPin, ...range]
      : range;

    if (toSummarize.length === 0) {
      return { status: "nothing" };
    }

    const pinned =
      cut.turnStartIndex >= 0
        ? messages[cut.turnStartIndex]
        : undefined;

    try {
      const result = await summarize(
        toSummarize,
        pinned?.role === "user" ? textOf(pinned.content) : undefined,
        state?.modelSummary,
        signal,
        customInstructions,
      );

      const readFiles = new Set<string>(state?.readFiles);
      const modifiedFiles = new Set<string>(state?.modifiedFiles);

      collectFiles(toSummarize, readFiles, modifiedFiles);

      const nextState: CompactionState = {
        modelSummary: result.text,
        summaryMessage: createSummaryMessage({
          modelSummary: result.text,
          readFiles,
          modifiedFiles,
        }),
        firstKeptIndex: cut.firstKeptIndex,
        turnStartIndex: cut.turnStartIndex,
        trustUsageFrom: messages.length,
        readFiles,
        modifiedFiles,
      };

      state = nextState;

      const event: CompactionEvent = {
        summary: result.text,
        attempts: result.attempts,
        checkpoint: checkpointOf(nextState),
        tokensBefore,
        estimatedTokensAfter: sumTokens(buildView(messages)),
        summarizedMessages: toSummarize.length,
        keptMessages: messages.length - cut.firstKeptIndex,
        ...(result.usage ? { usage: result.usage } : {}),
      };

      options.onCompaction?.(event);

      return { status: "compacted", event };
    } catch (error) {
      // 总结失败时保留原有压缩状态。
      options.onError?.(error);
      return { status: "failed", error };
    }
  }


  return {
    async transformContext(messages, signal) {
      const view = buildView(messages);
      const tokens = estimateCurrent(messages, view);

      const threshold =
        settings.contextWindow - settings.reserveTokens;

      options.onEstimate?.(tokens, threshold);

      if (tokens <= threshold) {
        return view;
      }

      const result = await compactNow(
        messages,
        tokens,
        signal,
        undefined,
      );

      return result.status === "compacted"
        ? buildView(messages)
        : view;
    },

    async compact(messages, compactOptions = {}) {
      const tokens = estimateCurrent(
        messages,
        buildView(messages),
      );

      return compactNow(
        messages,
        tokens,
        compactOptions.signal,
        compactOptions.customInstructions,
      );
    },
  };
}
