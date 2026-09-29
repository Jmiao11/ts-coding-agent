import Schema from "typebox/schema";

import type {
  AssistantMessage,
  Context,
  ToolCall,
  ToolResultMessage,
  SimpleStreamOptions,
} from "../ai/types.js";

import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentToolResult,
  StreamFn,
} from "./types.js";

import type {
  AgentRunStatus,
} from "./hooks.js";

import {
  createExtensionHost,
  type ExtensionHost,
} from "./extension-host.js";

/**
 * Agent Loop 不直接依赖 Agent class。
 * 它只负责产生事件，具体谁消费这些事件由外层决定。
 */
export type AgentEventSink = (
  event: AgentEvent,
) => Promise<void> | void;



function getToolCalls(
  message: AssistantMessage,
): ToolCall[] {
  return message.content.filter(
    (item): item is ToolCall =>
      item.type === "toolCall",
  );
}


function createToolErrorMessage(
  toolCall: ToolCall,
  error: unknown,
): ToolResultMessage {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  // 把错误包装成 ToolResultMessage
  return {
    role: "toolResult",

    toolCallId: toolCall.id,
    toolName: toolCall.name,

    content: [
      {
        type: "text",
        text: message,
      },
    ],

    isError: true,

    timestamp: Date.now(),
  };
}

async function executeToolCall(
  toolCall: ToolCall,
  context: AgentContext,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  turnIndex: number,
  extensionHost: ExtensionHost,
): Promise<ToolResultMessage> {

  const blocked = await extensionHost.beforeToolCall({
    turnIndex,
    toolCall,
  });

  if (blocked) {
    return createToolErrorMessage(
      toolCall,
      blocked.reason,
    );
  }

  const tool = context.tools?.find(
    (candidate) => candidate.name === toolCall.name,
  );

  if (!tool) {
    const errorMessage =
      `Tool not found: ${toolCall.name}`;

    await extensionHost.afterToolCall({
      turnIndex,
      toolCall,
      isError: true,
      errorMessage,
    });

    return createToolErrorMessage(
      toolCall,
      new Error(errorMessage),
    );
  }

  const validator = Schema.Compile(tool.parameters);

  if (!validator.Check(toolCall.arguments)) {
    const errorMessage =
      `Invalid arguments for tool: ${toolCall.name}`;

    await extensionHost.afterToolCall({
      turnIndex,
      toolCall,
      isError: true,
      errorMessage,
    });

    return createToolErrorMessage(
      toolCall,
      new Error(errorMessage),
    );
  }

  await emit({
    type: "tool_execution_start",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    args: toolCall.arguments,
  });

  let result: AgentToolResult;

  try {
    result = await tool.execute(
      toolCall.id,
      toolCall.arguments,
      signal,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    const toolResult =
      createToolErrorMessage(
        toolCall,
        error,
      );

    await extensionHost.afterToolCall({
      turnIndex,
      toolCall,
      isError: true,
      errorMessage,
    });

    await emit({
      type: "tool_execution_end",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result: toolResult,
      isError: true,
    });

    return toolResult;
  }

  const isError = result.isError ?? false;

  await emit({
    type: "tool_execution_end",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    result,
    isError,
  });

  await extensionHost.afterToolCall({
    turnIndex,
    toolCall,
    isError,
  });

  return {
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: result.content,
    isError,
    timestamp: Date.now(),
  };
}



/**
 * 执行一次最小 Agent Loop。
 *
 * 当前版本：
 * - 支持 prompt
 * - 支持 transformContext
 * - 支持 convertToLlm
 * - 支持流式模型输出
 *
 * 暂时还没有 Tool Call 循环。
 */
export async function runAgentLoop(
  prompts: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  streamFn: StreamFn,
  emit: AgentEventSink,
): Promise<AgentMessage[]> {
  const newMessages: AgentMessage[] = [
    ...prompts,
  ];

  const currentContext: AgentContext = {
    ...context,

    messages: [
      ...context.messages,
      ...prompts,
    ],
  };

  const extensionHost =
  createExtensionHost(config.extensions ?? []);

  let turnIndex = 0;
  let modelCallIndex = 0;
  let runStatus: AgentRunStatus = "completed";

async function startTurn(): Promise<void> {
  await extensionHost.onTurnStart({
    turnIndex,
  });

  await emit({ type: "turn_start" });
}

async function endTurn(
  message: AgentMessage,
  toolResults: AgentMessage[],
): Promise<void> {
  await extensionHost.onTurnEnd({
    turnIndex,
  });

  await emit({
    type: "turn_end",
    message,
    toolResults,
  });

  turnIndex += 1;
}

  try {
    await emit({
    type: "agent_start",
  });

  await startTurn();

  /*
   * prompt 本身进入 transcript。
   */
  for (const message of prompts) {
    await emit({
      type: "message_start",
      message,
    });

    await emit({
      type: "message_end",
      message,
    });
  }


  /*
   * M05.0：
   *
   * 第一次真正形成循环。
   *
   * Model
   * ↓
   * Tool
   * ↓
   * Model
   * ↓
   * ...
   */
  while (true) {
    let agentMessages =
      currentContext.messages;


    if (config.transformContext) {
      agentMessages =
        await config.transformContext(
          agentMessages,
          signal,
        );
    }


    const llmMessages =
      await config.convertToLlm(
        agentMessages,
      );


    const llmContext: Context = {
      ...(currentContext.systemPrompt
        ? {
            systemPrompt:
              currentContext.systemPrompt,
          }
        : {}),

      messages: llmMessages,
    };
    // 提取一份“工具说明卡片”
    const providerTools =
      currentContext.tools?.map(
        (tool) => ({
          name: tool.name,

          description:
            tool.description,

          parameters:
            tool.parameters,
        }),
      );


    const streamOptions:
      SimpleStreamOptions = {};


    if (signal) {
      streamOptions.signal =
        signal;
    }


    if (
      providerTools
      && providerTools.length > 0
    ) {
      streamOptions.tools =
        providerTools;
    }

    const modelCallId = `model-${modelCallIndex}`;
    modelCallIndex += 1;

    await extensionHost.beforeModelCall({
      callId: modelCallId,
      turnIndex,
      model: config.model,
      inputMessageCount: llmContext.messages.length,
    });

    const response =
      await streamFn(
        config.model,
        llmContext,

        Object.keys(
          streamOptions,
        ).length > 0
          ? streamOptions
          : undefined,
      );


    let finalMessage:
      AssistantMessage | undefined;


    for await (const event of response) {
      switch (event.type) {
        case "start": {
          await emit({
            type: "message_start",
            message: event.partial,
          });

          break;
        }


        case "text_delta": {
          await emit({
            type: "message_update",
            message: event.partial,
            assistantMessageEvent: event,
          });

          break;
        }


        case "done": {
          finalMessage =
            event.message;

          await emit({
            type: "message_end",
            message: event.message,
          });

          break;
        }


        case "error": {
          finalMessage =
            event.error;

          await emit({
            type: "message_end",
            message: event.error,
          });

          break;
        }
      }
    }


    if (!finalMessage) {
      throw new Error(
        "Assistant stream ended without a final message.",
      );
    }

    await extensionHost.afterModelCall({
      callId: modelCallId,
      turnIndex,
      message: finalMessage,
    });


    /*
     * 模型产生的 AssistantMessage
     * 正式进入当前上下文。
     */
    currentContext.messages.push(
      finalMessage,
    );

    newMessages.push(
      finalMessage,
    );


    /*
     * Provider/API 错误或取消：
     * 不应该继续执行 Tool。
     */
    if (
      finalMessage.stopReason === "error"
      || finalMessage.stopReason === "aborted"
    ) {
      runStatus = finalMessage.stopReason;
      await endTurn(finalMessage, []);
      break;
    }

    /*
     * 从 AssistantMessage 中寻找 ToolCall。
     */
    const toolCalls =
      getToolCalls(finalMessage);


    /*
     * 没有 ToolCall：
     *
     * 说明模型已经给出最终回答。
     */
    if (toolCalls.length === 0) {
      await endTurn(finalMessage, []);
      break;
    }


    /*
     * 有 ToolCall：
     *
     * Runtime 开始真正执行工具。
     */
    const toolResults: AgentMessage[] = [];


    for (const toolCall of toolCalls) {
      const toolResult = await executeToolCall(
        toolCall,
        currentContext,
        signal,
        emit,
        turnIndex,
        extensionHost,
      );

      /*
       * ToolResultMessage 本身也属于 transcript，
       * 因此走正常 message 生命周期。
       */
      await emit({
        type: "message_start",
        message: toolResult,
      });


      currentContext.messages.push(
        toolResult,
      );

      newMessages.push(
        toolResult,
      );

      toolResults.push(
        toolResult,
      );


      await emit({
        type: "message_end",
        message: toolResult,
      });
    }


    /*
     * 当前 Model → Tool turn 完成；
     * 下一轮再让模型处理工具结果。
     */
    await endTurn(finalMessage, toolResults);
    await startTurn();
  }


  await emit({
    type: "agent_end",
    messages: newMessages,
  });


  return newMessages;
  } catch (error) {
    runStatus = signal?.aborted
      ? "aborted"
      : "error";

    throw error;
  } finally {
      await extensionHost.onRunEnd({
        status: runStatus,
      });
    }
}
