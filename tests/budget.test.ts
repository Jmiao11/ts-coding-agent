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
    },
  );
});