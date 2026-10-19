/**
 * 人和 Agent 之间的界面：所有「往屏幕上写」和「向用户要输入」都经过这里。
 * Agent 核心和 cli 的流程不关心背后是普通终端（readline）还是 TUI。
 * 和 CommandExecutor 同一个思路：接口固定，实现可替换。
 */
export type AgentView = {
  /** 普通信息：启动信息、统计 */
  info(text: string): void;

  /** 诊断日志：模型、工具、上下文等运行细节 */
  log(text: string): void;

  /** 工具输出；界面决定是否折叠长内容 */
  toolOutput(title: string, text: string): void;

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

  /**
   * 用户按了 Ctrl+C。普通终端里它是进程的 SIGINT 信号；
   * TUI 把终端切到原始模式后不会再有 SIGINT，Ctrl+C 只是一个按键，由 TUI 自己转交过来。
   */
  onInterrupt(handler: () => void): void;

  /** 界面用完了：普通终端什么都不用做；TUI 要把终端恢复原样。可以重复调用 */
  close(): void;
};
