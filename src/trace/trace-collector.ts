import type {
  AssistantMessage,
  Model,
} from "../ai/types.js";

import type {
  ModelCallTrace,
  RunTrace,
  ToolCallTrace,
  TraceEvent,
} from "./types.js";


export type TraceCollector = {
  readonly trace: RunTrace;

  startTurn(
    turnIndex: number,
  ): void;

  endTurn(
    turnIndex: number,
  ): void;

  startModelCall(input: {
    callId: string;
    turnIndex: number;
    model: Model;
    inputMessageCount: number;
  }): void;

  endModelCall(input: {
    callId: string;
    stopReason:
      AssistantMessage["stopReason"];
    errorMessage?: string;
  }): void;

  startToolCall(input: {
    toolCallId: string;
    turnIndex: number;
    toolName: string;
    args: unknown;
  }): void;

  endToolCall(input: {
    toolCallId: string;
    isError: boolean;
    errorMessage?: string;
  }): void;

  finish(
    status:
      | "completed"
      | "error"
      | "aborted",
  ): void;
};


export function createTraceCollector(
  runId: string,
): TraceCollector {
  const startedAt =
    Date.now();


  const trace: RunTrace = {
    runId,

    status:
      "running",

    startedAt,

    modelCalls: [],

    toolCalls: [],

    events: [
      {
        type:
          "run_start",

        timestamp:
          startedAt,
      },
    ],
  };


  function record(
    event: TraceEvent,
  ): void {
    trace.events.push(
      event,
    );
  }


  return {
    trace,


    startTurn(
      turnIndex,
    ) {
      record({
        type:
          "turn_start",

        turnIndex,

        timestamp:
          Date.now(),
      });
    },


    endTurn(
      turnIndex,
    ) {
      record({
        type:
          "turn_end",

        turnIndex,

        timestamp:
          Date.now(),
      });
    },


    startModelCall(input) {
      const startedAt =
        Date.now();


      const modelCall:
        ModelCallTrace = {
        callId:
          input.callId,

        turnIndex:
          input.turnIndex,

        model: {
          id:
            input.model.id,

          provider:
            input.model.provider,
        },

        startedAt,

        inputMessageCount:
          input.inputMessageCount,
      };


      trace.modelCalls.push(
        modelCall,
      );


      record({
        type:
          "model_call_start",

        callId:
          input.callId,

        turnIndex:
          input.turnIndex,

        timestamp:
          startedAt,
      });
    },


    endModelCall(input) {
      const modelCall =
        trace.modelCalls.find(
          (candidate) =>
            candidate.callId
            === input.callId,
        );


      if (!modelCall) {
        throw new Error(
          `Unknown model call: ${input.callId}`,
        );
      }


      const endedAt =
        Date.now();


      modelCall.endedAt =
        endedAt;

      modelCall.stopReason =
        input.stopReason;


      if (
        input.errorMessage
        !== undefined
      ) {
        modelCall.errorMessage =
          input.errorMessage;
      }


      record({
        type:
          "model_call_end",

        callId:
          input.callId,

        turnIndex:
          modelCall.turnIndex,

        stopReason:
          input.stopReason,

        timestamp:
          endedAt,
      });
    },


    startToolCall(input) {
      const startedAt =
        Date.now();


      const toolCall:
        ToolCallTrace = {
        toolCallId:
          input.toolCallId,

        turnIndex:
          input.turnIndex,

        toolName:
          input.toolName,

        args:
          input.args,

        startedAt,
      };


      trace.toolCalls.push(
        toolCall,
      );


      record({
        type:
          "tool_call_start",

        toolCallId:
          input.toolCallId,

        turnIndex:
          input.turnIndex,

        toolName:
          input.toolName,

        args:
          input.args,

        timestamp:
          startedAt,
      });
    },


    endToolCall(input) {
      const toolCall =
        trace.toolCalls.find(
          (candidate) =>
            candidate.toolCallId
            === input.toolCallId,
        );


      if (!toolCall) {
        throw new Error(
          `Unknown tool call: ${input.toolCallId}`,
        );
      }


      const endedAt =
        Date.now();


      toolCall.endedAt =
        endedAt;

      toolCall.isError =
        input.isError;


      if (
        input.errorMessage
        !== undefined
      ) {
        toolCall.errorMessage =
          input.errorMessage;
      }


      record({
        type:
          "tool_call_end",

        toolCallId:
          input.toolCallId,

        turnIndex:
          toolCall.turnIndex,

        toolName:
          toolCall.toolName,

        isError:
          input.isError,

        timestamp:
          endedAt,
      });
    },


    finish(status) {
      /*
       * 避免同一个 Run 被结束两次。
       */
      if (
        trace.status
        !== "running"
      ) {
        return;
      }


      const endedAt =
        Date.now();


      trace.status =
        status;

      trace.endedAt =
        endedAt;


      record({
        type:
          "run_end",

        status,

        timestamp:
          endedAt,
      });
    },
  };
}