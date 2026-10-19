# K4b：真实模型 skill 触发评测

- 日期：2026-10-19；模型：deepseek-flash；Node.js：24.21.0。
- 命令：`node scripts/eval-skills.mjs --repeat 2`，8 个固定任务各运行两次。
- 每次独立启动一次性 CLI，不继续已有会话；stdin 关闭，保留默认审批。需审批的命令直接被拒绝，白名单内的 `pnpm typecheck` 可执行。
- 数据来自新会话的结构化消息，复用 `skillReadBy`。工具数为主会话 assistant 提出的 toolCall 数（包括可能被拒绝的调用）；skill 统计表示发起过读取 SKILL.md，不证明读取成功。
- Token 为主会话 assistant usage 的累加，加上独立记录的 compaction usage；不解析 CLI 日志，不单独统计子 Agent 内部的读取。
- 原始 JSON 保留在被忽略的 `evals/results/2026-10-19T09-32-12-305Z.json`；下面仅把输出的结果文件路径改为仓库相对路径。

## 完整输出

```text
a #1 | skills: mcp-builder | 对 | tools: 4 | in 16610 / out 1903
a #2 | skills: mcp-builder | 对 | tools: 4 | in 13525 / out 2056
b #1 | skills: mcp-builder | 对 | tools: 3 | in 13430 / out 2158
b #2 | skills: mcp-builder | 对 | tools: 2 | in 13334 / out 2396
c #1 | skills: frontend-design | 对 | tools: 11 | in 84103 / out 3042
c #2 | skills: frontend-design | 对 | tools: 29 | in 232520 / out 5056
d #1 | skills: frontend-design | 对 | tools: 2 | in 6587 / out 1398
d #2 | skills: frontend-design | 对 | tools: 2 | in 6598 / out 1911
e #1 | skills: (none) | 对 | tools: 1 | in 4323 / out 119
e #2 | skills: (none) | 对 | tools: 1 | in 4323 / out 101
f #1 | skills: (none) | 对 | tools: 1 | in 4483 / out 139
f #2 | skills: (none) | 对 | tools: 1 | in 4477 / out 121
g #1 | skills: (none) | 对 | tools: 0 | in 2123 / out 78
g #2 | skills: (none) | 对 | tools: 0 | in 2123 / out 78
h #1 | skills: (none) | 对 | tools: 3 | in 9886 / out 509
h #2 | skills: (none) | 对 | tools: 2 | in 7497 / out 473
触发正确 16/16
该读时读到 8/8
不该读时没读 8/8
平均 tokens（读了 skill，8 次）：in 48338.4 / out 2490.0 / total 50828.4
平均 tokens（没读 skill，8 次）：in 4904.4 / out 202.3 / total 5106.6
结果：evals/results/2026-10-19T09-32-12-305Z.json
```

## 解释与限制

- 本轮全部命中；这是单台机器、单个模型、每题两次的结果，不代表其他模型或任务也会全部命中。
- 读 skill 的任务与不读 skill 的任务不同，平均 Token 的差异不能单独归因于读取 skill。c #2 有 29 次工具调用、232520 输入 Token，显著拉高了读 skill 组的均值；未据此修改题目或提示词。
- 底栏已覆盖 100 / 120 / 133 / 138 / 180 列的静态与动态缩放测试，按终端列宽测量，并保留末列空白，避免提示文字碰到自动换行边界。
- 用户反馈 WindowWidth、BufferWidth、Node stdout.columns 都为 133，排除了这次缓冲区宽于窗口和 Node 列数误报；此前大窗口提示整段消失尚未在 FakeTerminal 中复现，末列防护不能作为已定位该现象根因的证据，仍需实际窗口复核。

