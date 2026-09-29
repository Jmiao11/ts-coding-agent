import type {
  AssistantMessage,
  Model,
  ToolCall,
} from "../ai/types.js";

import type {
  AgentRunStatus,
  BeforeToolCallResult,
} from "./hooks.js";

import type {
  AgentExtension,
} from "./extension.js";


export type ExtensionHost = {
  onTurnStart(input: {
    turnIndex: number;
  }): Promise<void>;

  beforeModelCall(input: {
    callId: string;
    turnIndex: number;
    model: Model;
    inputMessageCount: number;
  }): Promise<void>;

  afterModelCall(input: {
    callId: string;
    turnIndex: number;
    message: AssistantMessage;
  }): Promise<void>;

  beforeToolCall(input: {
    turnIndex: number;
    toolCall: ToolCall;
  }): Promise<BeforeToolCallResult | undefined>;

  afterToolCall(input: {
    turnIndex: number;
    toolCall: ToolCall;
    isError: boolean;
    errorMessage?: string;
  }): Promise<void>;

  onTurnEnd(input: {
    turnIndex: number;
  }): Promise<void>;

  onRunEnd(input: {
    status: AgentRunStatus;
  }): Promise<void>;
};


/**
 * Lifecycle contract:
 * - Extensions run in registration order; there is no priority system.
 * - before* hooks are fail-fast gates: a thrown error stops later hooks and
 *   prevents the Agent Loop from starting the core operation.
 * - The Agent Loop calls after* only after the matching before* phase passes.
 *   A failed tool call still reports afterToolCall({ isError: true }).
 * - The Agent Loop dispatches onRunEnd from finally, including failed runs.
 * - Hook errors propagate; extensions are not isolated from one another.
 */
export function createExtensionHost(
  extensions: AgentExtension[],
): ExtensionHost {
  return {
    async onTurnStart(input) {
      for (const extension of extensions) {
        await extension.hooks.onTurnStart?.(input);
      }
    },

    async beforeModelCall(input) {
      for (const extension of extensions) {
        await extension.hooks.beforeModelCall?.(input);
      }
    },

    async afterModelCall(input) {
      for (const extension of extensions) {
        await extension.hooks.afterModelCall?.(input);
      }
    },

    async beforeToolCall(input) {
      for (const extension of extensions) {
        const result =
          await extension.hooks.beforeToolCall?.(input);

        if (result) {
          return result;
        }
      }

      return undefined;
    },

    async afterToolCall(input) {
      for (const extension of extensions) {
        await extension.hooks.afterToolCall?.(input);
      }
    },

    async onTurnEnd(input) {
      for (const extension of extensions) {
        await extension.hooks.onTurnEnd?.(input);
      }
    },

    async onRunEnd(input) {
      for (const extension of extensions) {
        await extension.hooks.onRunEnd?.(input);
      }
    },
  };
}
