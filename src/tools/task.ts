import Type from "typebox";

import {
  runAgentLoop,
} from "../agent/agent-loop.js";

import type {
  AgentExtension,
} from "../agent/extension.js";

import type {
  AgentMessage,
  AgentTool,
  StreamFn,
} from "../agent/types.js";

import type {
  AssistantMessage,
  Model,
  TextContent,
} from "../ai/types.js";

import {
  BudgetExceededError,
} from "../extensions/budget.js";

import {
  sanitizeForLlm,
} from "../session/sanitize-for-llm.js";


const taskParameters =
  Type.Object(
    {
      description: Type.String({
        minLength: 1,
        description:
          "A short label for the task (3-10 words), shown in logs.",
      }),

      prompt: Type.String({
        minLength: 1,
        description:
          "Complete instructions for the sub-agent. It cannot see this conversation, so include every detail it needs and say what to report back.",
      }),
    },
    {
      additionalProperties: false,
    },
  );


export type TaskDetails = {
  description: string;
  modelCalls: number;
  toolCalls: number;
  usage: { input: number; output: number };
};


export type TaskToolOptions = {
  model: Model;
  streamFn: StreamFn;

  /** 子 Agent 自己的 system prompt */
  systemPrompt: string;

  /** 传入只读工具，不包含 task 自己。 */
  tools: AgentTool[];

  /** 有状态的扩展需要每个子任务重新创建。 */
  createExtensions?: () => AgentExtension[];
};


export function createTaskTool(
  options: TaskToolOptions,
): AgentTool<typeof taskParameters, TaskDetails> {
  return {
    name: "task",

    label: "Task",

    description:
      "Delegate a self-contained research task to a sub-agent that starts with a fresh, empty context. The sub-agent can only use read-only tools; it cannot edit files or run commands. Use it for exploration that would otherwise fill your context with file contents, for example \"find where X is implemented and summarize how it works\". Its final report is returned to you; the files it read are not.",

    parameters:
      taskParameters,

    async execute(
      _toolCallId,
      parameters,
      signal,
    ) {
      const prompt: AgentMessage = {
        role: "user",
        content: parameters.prompt,
        timestamp: Date.now(),
      };

      // 循环中途抛错时，也保留已经产生的完整消息。
      const messages: AgentMessage[] = [];
      let thrown: unknown;

      try {
        await runAgentLoop(
          [prompt],
          {
            systemPrompt: options.systemPrompt,
            messages: [],
            tools: options.tools,
          },
          {
            model: options.model,
            convertToLlm: sanitizeForLlm,
            extensions: options.createExtensions?.() ?? [],
          },
          signal,
          options.streamFn,
          (event) => {
            if (event.type === "message_end") {
              messages.push(event.message);
            }
          },
        );
      } catch (error) {
        thrown = error ?? new Error("unknown error");
      }

      const replies = messages.filter(
        (message): message is AssistantMessage =>
          message.role === "assistant",
      );

      const details: TaskDetails = {
        description: parameters.description,

        modelCalls: replies.length,

        toolCalls: messages.filter(
          (message) => message.role === "toolResult",
        ).length,

        usage: {
          input: replies.reduce(
            (sum, reply) =>
              sum + (reply.usage?.input ?? 0),
            0,
          ),

          output: replies.reduce(
            (sum, reply) =>
              sum + (reply.usage?.output ?? 0),
            0,
          ),
        },
      };

      const last = replies.at(-1);

      const report = last
        ?.content.filter(
          (item): item is TextContent =>
            item.type === "text",
        )
        .map((item) => item.text)
        .join("") ?? "";

      const failure = describeFailure(
        thrown,
        last,
        report,
        signal,
      );

      if (failure !== undefined) {
        return {
          content: [
            {
              type: "text",
              text: `Task not completed: ${failure}`,
            },
          ],
          details,
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: report,
          },
        ],
        details,
      };
    },
  };
}

/** 正常完成返回 undefined，否则返回给主 Agent 的失败说明。 */
function describeFailure(
  thrown: unknown,
  last: AssistantMessage | undefined,
  report: string,
  signal: AbortSignal | undefined,
): string | undefined {
  if (
    signal?.aborted
    || last?.stopReason === "aborted"
  ) {
    return "the user interrupted the run before the sub-agent finished.";
  }

  if (thrown instanceof BudgetExceededError) {
    return `the sub-agent used up its own budget (${thrown.message}). This was the sub-agent's budget, not yours; you can continue, for example with a narrower task.`;
  }

  if (thrown !== undefined) {
    return `the sub-agent stopped with an error: ${
      thrown instanceof Error
        ? thrown.message
        : String(thrown)
    }`;
  }

  if (last?.stopReason === "error") {
    return `the sub-agent's model call failed: ${
      last.errorMessage ?? "unknown error"
    }`;
  }

  if (report.trim().length === 0) {
    return "the sub-agent finished without writing a report.";
  }

  return undefined;
}