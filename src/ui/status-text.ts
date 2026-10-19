/** 状态栏中的累计 token 数；详细统计仍保留原始数值。 */
export function formatTokenCount(count: number): string {
  return count > 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}
