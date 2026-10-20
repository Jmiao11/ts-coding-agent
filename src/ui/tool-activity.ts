import type {
  AgentEvent,
} from "../agent/types.js";

import type {
  AgentView,
} from "./agent-view.js";

import { skillReadBy } from "../skills/skill-usage.js";


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


/** 已知工具取主要参数，MCP 工具取首个字符串参数，压成一行。 */
export function describeToolCall(
  toolName: string,
  args: unknown,
): string {
  const key = Object.hasOwn(SUMMARY_ARGUMENT, toolName) ? SUMMARY_ARGUMENT[toolName] : undefined;

  if (typeof args !== "object" || args === null) {
    return "";
  }

  const values = args as Record<string, unknown>;
  const value = key === undefined && toolName.startsWith("mcp__")
    ? Object.values(values).find((item) => typeof item === "string")
    : key === undefined ? undefined : values[key];

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
        skillReadBy(event.toolName, event.args),
      );
    }

    if (event.type === "tool_execution_end") {
      const result = event.result;
      const texts = typeof result === "object" && result !== null
        && "content" in result && Array.isArray(result.content)
        ? result.content.filter(
          (item): item is { type: "text"; text: string } =>
            typeof item === "object" && item !== null
            && item.type === "text" && typeof item.text === "string",
        )
        : [];

      if (texts.length > 0) {
        view.toolEnd(event.toolCallId, !event.isError, texts.map((item) => item.text).join(""));
      } else {
        view.toolEnd(event.toolCallId, !event.isError);
      }
    }
  };
}
