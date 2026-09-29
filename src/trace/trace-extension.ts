import type {
  AgentExtension,
} from "../agent/extension.js";

import type {
  TraceCollector,
} from "./trace-collector.js";


// 把 Extension 生命周期通知转换为 TraceCollector 的记录操作。
export function createTraceExtension(
  trace: TraceCollector,
): AgentExtension {
  return {
    name: "trace",
    hooks: {
    onTurnStart({ turnIndex }) {
      trace.startTurn(turnIndex);
    },

    beforeModelCall(input) {
      trace.startModelCall(input);
    },

    afterModelCall({
      callId,
      message,
    }) {
      trace.endModelCall({
        callId,
        stopReason: message.stopReason,

        ...(message.errorMessage !== undefined
          ? {
              errorMessage: message.errorMessage,
            }
          : {}),
      });
    },

    beforeToolCall({
      turnIndex,
      toolCall,
    }) {
      trace.startToolCall({
        toolCallId: toolCall.id,
        turnIndex,
        toolName: toolCall.name,
        args: toolCall.arguments,
      });
    },

    afterToolCall({
      toolCall,
      isError,
      errorMessage,
    }) {
      trace.endToolCall({
        toolCallId: toolCall.id,
        isError,

        ...(errorMessage !== undefined
          ? { errorMessage }
          : {}),
      });
    },

    onTurnEnd({ turnIndex }) {
      trace.endTurn(turnIndex);
    },

    onRunEnd({ status }) {
      trace.finish(status);
    },
    },
  };
}
