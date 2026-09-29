import type {
  AgentExtension,
} from "../agent/extension.js";


export type LogSink =
  (message: string) => void;


export function createLoggerExtension(
  log: LogSink =
    console.log,
): AgentExtension {
  return {
    name: "logger",
    hooks: {
    onTurnStart({
      turnIndex,
    }) {
      log(
        `[turn ${turnIndex}] start`,
      );
    },


    beforeModelCall({
      callId,
      turnIndex,
      model,
      inputMessageCount,
    }) {
      log(
        [
          `[model start]`,
          `call=${callId}`,
          `turn=${turnIndex}`,
          `model=${model.id}`,
          `messages=${inputMessageCount}`,
        ].join(" "),
      );
    },


    afterModelCall({
      callId,
      turnIndex,
      message,
    }) {
      log(
        [
          `[model end]`,
          `call=${callId}`,
          `turn=${turnIndex}`,
          `stopReason=${message.stopReason}`,
        ].join(" "),
      );
    },


    beforeToolCall({
      turnIndex,
      toolCall,
    }) {
      log(
        [
          `[tool start]`,
          `turn=${turnIndex}`,
          `tool=${toolCall.name}`,
          `id=${toolCall.id}`,
          `args=${JSON.stringify(
            toolCall.arguments,
          )}`,
        ].join(" "),
      );
    },


    afterToolCall({
      turnIndex,
      toolCall,
      isError,
      errorMessage,
    }) {
      log(
        [
          `[tool end]`,
          `turn=${turnIndex}`,
          `tool=${toolCall.name}`,
          `error=${isError}`,
          ...(errorMessage
            ? [
                `message=${errorMessage}`,
              ]
            : []),
        ].join(" "),
      );
    },


    onTurnEnd({
      turnIndex,
    }) {
      log(
        `[turn ${turnIndex}] end`,
      );
    },


    onRunEnd({
      status,
    }) {
      log(
        `[run end] status=${status}`,
      );
    },
    },
  };
}
