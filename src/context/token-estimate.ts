import type {
  AgentMessage,
} from "../agent/types.js";

import type {
  TextContent,
} from "../ai/types.js";


/**
 * 粗估一段文本的 token 数。
 *
 * Pi 用 chars/4，对英文偏保守；但中文大约一个字符就是一个 token，
 * chars/4 会严重低估。所以 ASCII 按 /3，非 ASCII 按 1:1。
 * 准不准以真实 usage 校准为准。
 */
export function estimateTextTokens(
  text: string,
): number {
  let ascii = 0;
  let other = 0;

  for (const char of text) {
    if ((char.codePointAt(0) ?? 0) < 128) {
      ascii += 1;
    } else {
      other += 1;
    }
  }

  // C4 真实校准（DeepSeek）：代码类 ASCII 按 /4 会低估约 17%～22%，
  // 改成 /3，略微偏高，阈值判断宁早勿晚
  return Math.ceil(ascii / 3) + other;
}


export function textOf(
  content: string | TextContent[],
): string {
  return typeof content === "string"
    ? content
    : content.map((item) => item.text).join("");
}


export function estimateMessageTokens(
  message: AgentMessage,
): number {
  switch (message.role) {
    case "system":
    case "user":
    case "toolResult":
      return estimateTextTokens(textOf(message.content));
      // 这三个角色使用相同的处理逻辑，所以共用一个 return。

    // 它不仅能够包含普通文本，还能包含 ToolCall（工具调用）。
    case "assistant":
      return message.content.reduce(
        (sum, item) =>
          sum + (
            item.type === "text"
              ? estimateTextTokens(item.text)
              : estimateTextTokens(
                item.name + JSON.stringify(item.arguments),
              )
          ),
        0,
      );
  }
}


export type ContextEstimate = {
  /** 估算的 Context 总 token 数 */
  tokens: number;

  /** 来自 Provider 真实 usage 的部分（最后一次模型调用的 input + output） */
  usageTokens: number;

  /** 在那之后新增消息的估算部分 */
  trailingTokens: number;
};


/**
 * 估算当前 Context 大小：
 * 最后一条可信 assistant 消息的真实 usage + 它之后新增消息的估算。
 *
 * trustUsageFrom：只信任这个下标之后的 usage。
 * 压缩后保留下来的 assistant 消息，usage 是按压缩前的大 Context 统计的，
 * 不能再用（Pi 0.80.6 修过同样的问题）。
 */
export function estimateContextTokens(
  messages: AgentMessage[],
  trustUsageFrom = 0,
): ContextEstimate {
  for (let index = messages.length - 1; index >= trustUsageFrom; index -= 1) {
    const message = messages[index];

    if (
      message?.role === "assistant"
      && message.stopReason !== "error"
      && message.stopReason !== "aborted"
      && message.usage
      && message.usage.input > 0
    ) {
      const usageTokens =
        message.usage.input + message.usage.output;

      const trailingTokens = messages
        .slice(index + 1)
        .reduce((sum, item) => sum + estimateMessageTokens(item), 0);

      return {
        tokens: usageTokens + trailingTokens,
        usageTokens,
        trailingTokens,
      };
    }
  }

  // 没有可信 usage：全部靠估算
  const trailingTokens = messages.reduce(
    (sum, item) => sum + estimateMessageTokens(item),
    0,
  );

  return {
    tokens: trailingTokens,
    usageTokens: 0,
    trailingTokens,
  };
}
