import type {
  AgentMessage,
} from "../agent/types.js";

import type {
  Message,
  ToolCall,
} from "../ai/types.js";


/**
 * 发送前整理历史：
 * - 去掉 error / aborted 的 assistant 消息。
 * - 给缺失结果的工具调用补错误结果。
 * - 丢掉无法匹配工具调用的结果。
 *
 * 不修改原始 transcript。
 */
export function sanitizeForLlm(
  messages: AgentMessage[],
): Message[] {
  const result: Message[] = [];

  let pending: ToolCall[] = [];

  function closePending(): void {
    for (const call of pending) {
      result.push({
        role: "toolResult",
        toolCallId: call.id,
        toolName: call.name,
        content: [{
          type: "text",
          text: "No result: this tool call was interrupted before it finished.",
        }],
        isError: true,
        timestamp: Date.now(),
      });
    }

    pending = [];
  }

  for (const message of messages) {
    if (message.role === "toolResult") {
      const index = pending.findIndex(
        (call) => call.id === message.toolCallId,
      );

      if (index >= 0) {
        pending.splice(index, 1);
        result.push(message);
      }

      continue;
    }

    closePending();

    if (
      message.role === "assistant"
      && (
        message.stopReason === "error"
        || message.stopReason === "aborted"
      )
    ) {
      continue;
    }

    result.push(message);

    if (message.role === "assistant") {
      pending = message.content.filter(
        (item): item is ToolCall => item.type === "toolCall",
      );
    }
  }

  closePending();

  return result;
}