import type {
  AssistantMessage,
} from "../ai/types.js";


export type TraceRunStatus =
  | "running"
  | "completed"
  | "error"
  | "aborted";


/*
 * 一次模型调用的最终结果。
 *
 * 注意：
 * 这里记录的是“模型调用”，
 * 不是整个 Agent Run。
 */
export type ModelCallTrace = {
  callId: string;

  turnIndex: number;

  model: {
    id: string;
    provider: string;
  };

  startedAt: number;

  endedAt?: number;

  /*
   * 发送给模型多少条消息。
   *
   * 先不保存完整 messages，
   * 避免 Trace 一开始就复制整个 Context。
   */
  inputMessageCount: number;

  stopReason?:
    AssistantMessage["stopReason"];

  errorMessage?: string;
};


/*
 * 一次 ToolCall 的执行记录。
 */
export type ToolCallTrace = {
  toolCallId: string;

  turnIndex: number;

  toolName: string;

  args: unknown;

  startedAt: number;

  endedAt?: number;

  isError?: boolean;

  errorMessage?: string;
};


/*
 * Trace 中真正按时间发生的事件。
 *
 * 第一版只保留：
 * Run / Turn / Model / Tool
 *
 * 不记录 text_delta，
 * 否则一个回答可能产生几百条 TraceEvent。
 */
export type TraceEvent =
  | {
      type: "run_start";

      timestamp: number;
    }

  | {
      type: "turn_start";

      turnIndex: number;

      timestamp: number;
    }

  | {
      type: "model_call_start";

      callId: string;

      turnIndex: number;

      timestamp: number;
    }

  | {
      type: "model_call_end";

      callId: string;

      turnIndex: number;

      stopReason:
        AssistantMessage["stopReason"];

      timestamp: number;
    }

  | {
      type: "tool_call_start";

      toolCallId: string;

      turnIndex: number;

      toolName: string;

      args: unknown;

      timestamp: number;
    }

  | {
      type: "tool_call_end";

      toolCallId: string;

      turnIndex: number;

      toolName: string;

      isError: boolean;

      timestamp: number;
    }

  | {
      type: "turn_end";

      turnIndex: number;

      timestamp: number;
    }

  | {
      type: "run_end";

      status:
        Exclude<
          TraceRunStatus,
          "running"
        >;

      timestamp: number;
    };


// RunTrace
// ├── runId / status / startedAt
// ├── modelCalls
// ├── toolCalls
// └── events
export type RunTrace = {
  runId: string;

  status:
    TraceRunStatus;

  startedAt: number;

  endedAt?: number;

  /*
   * 以后可以直接回答：
   *
   * - 调了几次模型？
   * - 每次为什么结束？
   */
  modelCalls:
    ModelCallTrace[];


  /*
   * 以后可以直接回答：
   *
   * - 调了什么工具？
   * - 参数是什么？
   * - 是否失败？
   */
  toolCalls:
    ToolCallTrace[];


  /*
   * 保留真实发生顺序。
   */
  events:
    TraceEvent[];
};
