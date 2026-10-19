import type {
  AgentEvent,
} from "../agent/types.js";

import type {
  TextContent,
} from "../ai/types.js";

import type {
  AgentView,
} from "./agent-view.js";


/** 首段文字开始回答，消息结束时收尾；无增量时补全文，避免重复输出。 */
export function streamAnswers(
  view: Pick<AgentView, "beginAnswer" | "appendAnswer" | "endAnswer">,
): (event: AgentEvent) => void {
  let open = false;

  return (event) => {
    if (
      event.type === "message_update"
      && event.assistantMessageEvent.type === "text_delta"
    ) {
      if (!open) {
        view.beginAnswer();
        open = true;
      }

      view.appendAnswer(event.assistantMessageEvent.delta);
      return;
    }

    if (
      event.type !== "message_end"
      || event.message.role !== "assistant"
    ) {
      return;
    }

    if (!open) {
      const text = event.message.content
        .filter((item): item is TextContent => item.type === "text")
        .map((item) => item.text)
        .join("");

      if (text.length === 0) {
        return;
      }

      view.beginAnswer();
      view.appendAnswer(text);
    }

    view.endAnswer();
    open = false;
  };
}
