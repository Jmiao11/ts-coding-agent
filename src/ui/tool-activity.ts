import type {
  AgentEvent,
} from "../agent/types.js";

import type {
  AgentView,
} from "./agent-view.js";


const SUMMARY_ARGUMENT: Record<string, string> = {
  list_directory: "path",
  read_file: "path",
  write_file: "path",
  edit_file: "path",
  search_text: "pattern",
  run_command: "command",
  task: "description",
};

const MAX_SUMMARY_LENGTH = 60;


/** 只提取工具的主要参数，压成一行；未知工具或参数不猜测。 */
export function describeToolCall(
  toolName: string,
  args: unknown,
): string {
  const key = Object.hasOwn(SUMMARY_ARGUMENT, toolName) ? SUMMARY_ARGUMENT[toolName] : undefined;

  if (key === undefined || typeof args !== "object" || args === null) {
    return "";
  }

  const value = (args as Record<string, unknown>)[key];

  if (typeof value !== "string") {
    return "";
  }

  const oneLine = value.replace(/\s+/g, " ").trim();

  return oneLine.length > MAX_SUMMARY_LENGTH
    ? `${oneLine.slice(0, MAX_SUMMARY_LENGTH - 1)}…`
    : oneLine;
}


/** 结构化事件按 toolCallId 关联，不依赖日志文字或完成顺序。 */
export function showToolActivity(
  view: Pick<AgentView, "toolStart" | "toolEnd">,
): (event: AgentEvent) => void {
  return (event) => {
    if (event.type === "tool_execution_start") {
      view.toolStart(
        event.toolCallId,
        event.toolName,
        describeToolCall(event.toolName, event.args),
      );
    }

    if (event.type === "tool_execution_end") {
      view.toolEnd(event.toolCallId, !event.isError);
    }
  };
}
