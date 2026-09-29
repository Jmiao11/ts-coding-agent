import type {
  AssistantMessage,
} from "../../src/ai/types.js";

import {
  createAssistantMessageEventStream,
} from "../../src/ai/event-stream.js";

import type {
  StreamFn,
} from "../../src/agent/types.js";


/**
 * 创建一条假的 AssistantMessage。
 *
 * Fake Provider 后面会反复调用它：
 * - start 时 text = ""
 * - 第一个 delta 后 text = "你"
 * - 第二个 delta 后 text = "你好"
 * - done 时 text = "你好"
 */
function createAssistantMessage(
  provider: string,
  model: string,
  text: string,
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",

    content: [
      {
        type: "text",
        text,
      },
    ],

    provider,
    model,
    stopReason,

    timestamp: Date.now(),
  };
}


/**
 * 创建一个假的 StreamFn。
 *
 * chunks 代表模型将分几次输出文本。
 * 例如：
 * ["你", "好"]
 *
 * 最终会模拟成：
 * start → "你" → "好" → done
 */
export function createFakeStreamFn(
  chunks: string[],
): StreamFn {
  return (model, _context, _options) => {
    const stream =
      createAssistantMessageEventStream();


    // 当前累计生成出来的完整文本
    let text = "";


    // 1. 先告诉 Agent：
    // assistant message 开始生成了
    stream.push({
      type: "start",
      partial: createAssistantMessage(
        model.provider,
        model.id,
        text,
      ),
    });


    // 2. 模拟模型逐块输出文本
    for (const chunk of chunks) {
      // 例如：
      // 第一次 chunk = "你"  → text = "你"
      // 第二次 chunk = "好"  → text = "你好"
      text += chunk;


      stream.push({
        type: "text_delta",

        // 当前更新的是 content[0]
        contentIndex: 0,

        // 本次新增加的内容
        delta: chunk,

        // 当前 assistant message 的完整快照
        partial: createAssistantMessage(
          model.provider,
          model.id,
          text,
        ),
      });
    }


    // 现在暂时直接结束。
    // 下一步再补真正的 done 事件。
  // 3. 模型完整生成结束后，构造最终 AssistantMessage
  const finalMessage =
    createAssistantMessage(
      model.provider,
      model.id,
      text,
    );


  // 告诉 Agent Loop：
  // “这条 assistant message 已经生成完成。”
  stream.push({
    type: "done",
    reason: "stop",
    message: finalMessage,
  });


  // 事件全部发送完，关闭 stream
  stream.end();

  return stream;
  };
}