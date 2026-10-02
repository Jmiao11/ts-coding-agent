import type {
  AgentExtension,
} from "../agent/extension.js";

import type {
  AgentLoopHooks,
} from "../agent/hooks.js";


export type BudgetLimits = {
  maxModelCalls?: number;
  maxToolCalls?: number;
};


export type BudgetState = {
  modelCalls: number;
  toolCalls: number;
};


export type BudgetResource =
  | "model_calls"
  | "tool_calls";


// 这个类定义了一种专门表示“预算超限”的错误，方便程序识别超限原因。
export class BudgetExceededError extends Error {

  // readonly 表示 TypeScript 不允许之后重新给字段赋值。
  readonly resource: BudgetResource;
  readonly limit: number;

  constructor(
    resource: BudgetResource,
    limit: number,
  ) {
    // 调用父类 Error 的构造函数，设置错误消息。比如模型调用上限是 5，消息就是：
    super(
      `Budget exceeded: ${resource} limit is ${limit}.`,
    );

    this.name = "BudgetExceededError";
    this.resource = resource;
    this.limit = limit;
  }
}


export type BudgetExtension = AgentExtension & {
  getState(): BudgetState;
};


function assertLimit(
  name: string,
  value: number | undefined,
): void {
  if (
    value !== undefined
    && (
      !Number.isInteger(value)
      || value < 1
    )
  ) {
    throw new Error(
      `${name} must be a positive integer.`,
    );
  }
}


export function createBudgetExtension(
  limits: BudgetLimits,
): BudgetExtension {
  assertLimit(
    "maxModelCalls",
    limits.maxModelCalls,
  );

  assertLimit(
    "maxToolCalls",
    limits.maxToolCalls,
  );

  let modelCalls = 0;
  let toolCalls = 0;

  const hooks: AgentLoopHooks = {
    beforeModelCall() {
      if (
        limits.maxModelCalls !== undefined
        && modelCalls >= limits.maxModelCalls
      ) {
        throw new BudgetExceededError(
          "model_calls",
          limits.maxModelCalls,
        );
      }

      modelCalls += 1;
    },

    beforeToolCall() {
      if (
        limits.maxToolCalls !== undefined
        && toolCalls >= limits.maxToolCalls
      ) {
        return {
          block: true,
          reason:
            `Budget exceeded: tool_calls limit is ${limits.maxToolCalls}. No more tool calls will run in this task; finish now with the information you already have.`,
        };
      }

      toolCalls += 1;
    },
  };

  return {
    name: "budget",
    hooks,

    getState() {
      return {
        modelCalls,
        toolCalls,
      };
    },
  };
}
