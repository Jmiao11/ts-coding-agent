/**
 * 人和 Agent 之间的界面：所有「往屏幕上写」和「向用户要输入」都经过这里。
 * Agent 核心和 cli 的流程不关心背后是普通终端（readline）还是 TUI。
 * 和 CommandExecutor 同一个思路：接口固定，实现可替换。
 */
export type AgentView = {
  /** 普通信息：启动信息、日志行、统计 */
  info(text: string): void;

  /** 警告和错误 */
  warn(text: string): void;

  /** 一条模型回答开始了（第一段文字到达时） */
  beginAnswer(): void;

  /** 回答的下一段文字（流式输出的增量） */
  appendAnswer(delta: string): void;

  /** 这条回答结束了 */
  endAnswer(): void;

  /** 读一行输入。Ctrl+C 或输入关闭（Ctrl+D）时返回 null，由调用方决定怎么处理 */
  readLine(prompt: string): Promise<string | null>;

  /** 是 / 否确认，只有回答 y 才算同意。没人能回答（非交互环境）时直接返回 false */
  confirm(question: string): Promise<boolean>;
};
