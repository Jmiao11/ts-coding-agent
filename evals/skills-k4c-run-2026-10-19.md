# K4c：隐式触发与目录注入 A/B

- 日期：2026-10-19；模型：deepseek-flash；Node.js：24.21.0。
- 每次独立启动一次性 CLI，新会话、关闭 stdin，保留默认审批。未修改 README、题目措辞、skill 描述或提示词来追求命中率。
- `--no-skills` 不扫描目录，传入空 skill 数组；提示词与没有 skill 目录时逐字节一致。它不禁止模型通过文件工具自行发现 skill。
- A/B 奇数轮先启用 skill，偶数轮先禁用。只统计工具调用与 Token，不让模型打分。
- 统计来自主会话 assistant 的 toolCall 与 usage，另加 compaction usage；不解析 CLI 输出，不单独累加子 Agent 内部用量。skill 统计是发起读取 SKILL.md，不保证调用成功。
- 原始 JSON、24 条最终回答的左右对照 Markdown 位于被忽略的 `evals/results/`。以下输出仅把结果文件路径改为仓库相对路径。

## 12 题触发评测

命令：`node scripts/eval-skills.mjs --repeat 2`

```text
a #1 | skills: mcp-builder | 对 | tools: 9 | in 75538 / out 2179
a #2 | skills: mcp-builder | 对 | tools: 7 | in 53602 / out 2432
b #1 | skills: mcp-builder | 对 | tools: 3 | in 13430 / out 1968
b #2 | skills: mcp-builder | 对 | tools: 2 | in 13300 / out 2588
c #1 | skills: (none) | 错 | tools: 4 | in 15318 / out 3287
c #2 | skills: frontend-design | 对 | tools: 5 | in 25971 / out 2207
d #1 | skills: frontend-design | 对 | tools: 2 | in 6590 / out 1514
d #2 | skills: frontend-design | 对 | tools: 4 | in 9187 / out 1515
e #1 | skills: (none) | 对 | tools: 1 | in 4323 / out 103
e #2 | skills: (none) | 对 | tools: 1 | in 4323 / out 103
f #1 | skills: (none) | 对 | tools: 1 | in 4477 / out 153
f #2 | skills: (none) | 对 | tools: 1 | in 4477 / out 133
g #1 | skills: (none) | 对 | tools: 0 | in 2123 / out 107
g #2 | skills: (none) | 对 | tools: 0 | in 2123 / out 87
h #1 | skills: (none) | 对 | tools: 2 | in 7530 / out 428
h #2 | skills: (none) | 对 | tools: 2 | in 7555 / out 454
i #1 | skills: mcp-builder | 对 | tools: 5 | in 13603 / out 1914
i #2 | skills: mcp-builder | 对 | tools: 7 | in 50772 / out 2539
j #1 | skills: (none) | 错 | tools: 2 | in 4554 / out 1217
j #2 | skills: (none) | 错 | tools: 0 | in 2141 / out 972
k #1 | skills: frontend-design | 对 | tools: 5 | in 19653 / out 1367
k #2 | skills: frontend-design | 对 | tools: 8 | in 40069 / out 2019
l #1 | skills: (none) | 对 | tools: 3 | in 10014 / out 1324
l #2 | skills: (none) | 对 | tools: 3 | in 8938 / out 1485
触发正确 21/24
该读时读到 11/14
不该读时没读 10/10
平均 tokens（读了 skill，11 次）：in 29246.8 / out 2022.0 / total 31268.8
平均 tokens（没读 skill，13 次）：in 5992.0 / out 757.9 / total 6749.9
结果：evals/results/2026-10-19T09-41-07-192Z.json
```

三次漏触发为 c #1、j #1、j #2；10 次负例均未读取 skill。命中率不等于回答质量。

## A/B

命令：`node scripts/eval-skills.mjs --ab --repeat 2 --only a,b,d,i,j,k`

```text
a | 有 skill: tools 8.5 | in 50614.0 / out 2544.0 (2/2 完成) | 无 skill: tools 12.5 | in 31699.5 / out 2642.0 (2/2 完成)
b | 有 skill: tools 2.5 | in 13505.0 / out 1994.0 (2/2 完成) | 无 skill: tools 3.5 | in 12010.5 / out 2539.0 (2/2 完成)
d | 有 skill: tools 2.5 | in 9439.5 / out 1550.5 (2/2 完成) | 无 skill: tools 0.0 | in 1842.0 / out 1535.5 (2/2 完成)
i | 有 skill: tools 4.0 | in 16322.0 / out 2303.5 (2/2 完成) | 无 skill: tools 5.0 | in 21459.5 / out 2609.0 (2/2 完成)
j | 有 skill: tools 6.0 | in 32660.5 / out 1424.5 (2/2 完成) | 无 skill: tools 0.0 | in 1853.0 / out 1002.5 (2/2 完成)
k | 有 skill: tools 8.5 | in 32572.5 / out 1934.5 (2/2 完成) | 无 skill: tools 8.0 | in 22028.5 / out 1337.0 (2/2 完成)
回答对比：evals/results/2026-10-19T09-46-23-890Z-ab.md
结果：evals/results/2026-10-19T09-46-23-890Z-ab.json
```

回答对照：[2026-10-19T09-46-23-890Z-ab.md](results/2026-10-19T09-46-23-890Z-ab.md)。该文件只留在本机，不纳入提交。

## 解释边界

- 24 次 A/B 运行均正常结束，得到 24 条非空最终回答；6 个任务每个都有两条有 skill 和两条无 skill 的回答，没有评分字段。
- “有 skill / 无 skill”表示是否开启目录扫描和提示词注入，不表示实际有没有读 skill。禁用侧的 i #1、i #2 仍通过仓库搜索发现并发起读取 mcp-builder；k #2 也发起读取 frontend-design。这几次不能当作完全不使用 skill 的对照。
- 两轮数据不足以证明稳定的效率或质量差异。Token 为主会话累计输入/输出，不能直接等同于总费用；回答质量留给人工比较。

## 结论与限制

- 改提示词之前，触发正确 21/24；j 两次都没读 mcp-builder，模型觉得自己会就直接回答了。提示词改动已在 `dd54454` 中完成；2026-10-20 按修改后的提示词独立抽查：j 读了 mcp-builder，g 和 l 均未读 skill，三题都正确，每题样本只有 1 次，不能据此推断稳定命中率。
- 这份旧 A/B 的对照组被污染了：`--no-skills` 侧的模型通过 `list_directory`、`search_text` 发现了 `.agent/skills` 并自行读取 skill（i 两次、k 一次）。所以这次的 A/B 数据不能用来说明 skill 提升了质量或者节省了 token。
- 以后重新做 A/B，对照组应该在一个删掉了 `.agent/skills` 的临时 git worktree 中运行，同时传入 `--no-skills`。该隔离方式已在 `420b207` 中实现；本次只做抽查，没有重新运行 A/B。
- 已观察到读 skill 的一侧输入 token 增加：旧 A/B 中，d 是约 9.4k 对 1.8k，j 是约 32.7k 对 1.9k。这些数值也包含后续工具调用的影响，不能把全部差额都归因于 skill 正文本身。

抽查命令：`pnpm build` 后运行 `node scripts/eval-skills.mjs --only j,g,l --repeat 1`。以下仅将结果文件路径改为仓库相对路径；未合并已中止的全量评测数据。

```text
g #1 | skills: (none) | 对 | tools: 0 | in 2185 / out 93
j #1 | skills: mcp-builder | 对 | tools: 9 | in 58483 / out 1910
l #1 | skills: (none) | 对 | tools: 4 | in 14913 / out 1545
触发正确 3/3
该读时读到 1/1
不该读时没读 2/2
平均 tokens（读了 skill，1 次）：in 58483.0 / out 1910.0 / total 60393.0
平均 tokens（没读 skill，2 次）：in 8549.0 / out 819.0 / total 9368.0
结果：evals/results/2026-10-20T01-24-57-995Z.json
```


