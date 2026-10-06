export type WriteTarget = {
  absolutePath: string;

  /** 相对 workspace，用 / 分隔 */
  relativePath: string;

  toolCallId: string;
};


/**
 * 写工具在通过所有安全检查之后，把「真正写文件」这一步交给它执行。
 * 由使用者决定要不要记录（例如检查点）；工具本身不知道任务和会话。
 */
export type WriteTracker = <T>(
  target: WriteTarget,
  write: () => Promise<T>,
) => Promise<T>;


/** 不记录，直接写 */
export const untracked: WriteTracker = <T>(
  _target: WriteTarget,
  write: () => Promise<T>,
): Promise<T> => write();
