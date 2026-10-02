import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BudgetExceededError,
  createBudgetExtension,
} from "../src/extensions/budget.js";


describe("BudgetExtension", () => {
  it(
    "blocks calls after the configured limit",
    async () => {
      const budget =
        createBudgetExtension({
          maxModelCalls: 1,
          maxToolCalls: 1,
        });


      /*
       * 第一次允许。
       */
      await budget.hooks
        .beforeModelCall?.({
          callId: "model-0",

          turnIndex: 0,

          model: {
            id: "fake-model",
            provider: "fake",
            name: "Fake",

            contextWindow: 1000,
            maxTokens: 100,
          },

          inputMessageCount: 1,
        });


      /*
       * 第二次模型调用被挡住。
       */
        expect(() =>
          budget.hooks.beforeModelCall?.({
            callId: "model-1",
            turnIndex: 1,

            model: {
              id: "fake-model",
              provider: "fake",
              name: "Fake",
              contextWindow: 1000,
              maxTokens: 100,
            },

            inputMessageCount: 2,
          }),
        ).toThrow(BudgetExceededError);


      expect(
        budget.getState(),
      ).toEqual({
        modelCalls: 1,
        toolCalls: 0,
      });

      const toolCall = {
        type: "toolCall" as const,
        id: "call-1",
        name: "read_file",
        arguments: { path: "a.ts" },
      };

      expect(
        await budget.hooks.beforeToolCall?.({ turnIndex: 0, toolCall }),
      ).toBeUndefined();

      expect(
        await budget.hooks.beforeToolCall?.({ turnIndex: 1, toolCall }),
      ).toEqual({
        block: true,
        reason:
          "Budget exceeded: tool_calls limit is 1. No more tool calls will run in this task; finish now with the information you already have.",
      });
    },
  );
});
