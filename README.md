# TS Coding Agent — A lightweight TypeScript Coding Agent Runtime inspired by Pi.

从 Agent Loop 出发，自主实现工具调用、上下文压缩、持久化会话与文件撤销，用于探索 Coding Agent 的底层工程机制。

架构参考 [Pi](https://github.com/earendil-works/pi)（原 `badlogic/pi-mono`），感谢 Mario Zechner 与 Pi 贡献者。本项目不是 Pi 官方发行版；Pi 采用 [MIT License](https://github.com/earendil-works/pi/blob/main/LICENSE)。

压缩总结模板沿用 Pi 的章节结构，对应来源与版权声明见 [第三方许可说明](THIRD_PARTY_NOTICES.md)。

它提供一个 CLI 命令 `ts-coding-agent`：在（必须是）Git 仓库里跑一个 agent loop，模型可以调用文件工具和 shell 命令来完成任务，并且会在终端里告诉你做了什么、花了多少 token。

> **Preview / Experimental**：接口、行为和目录结构都还在变。没有完整沙箱，命令可能修改工作区外的文件；请只在你愿意随时回滚的仓库里试。

---

## 环境要求

- **Node.js**：需要 Node ≥ 24
- **pnpm**：`package.json` 的 `packageManager` 固定为 `pnpm@12.5.1`
- **git**：CLI 启动时会检查工作目录是不是 Git 仓库

## 安装

在仓库根目录：

```bash
pnpm install
pnpm build
```

`pnpm build` 用 `tsc -p tsconfig.build.json` 把 `src/` 编译到 `dist/`，入口是 `dist/cli.js`（也就是 `package.json` 里的 `bin`）。项目是 ESM（`"type": "module"`）。

## 配置

配置默认放在**主目录**下的 `.agent-harness.env`：

- macOS/Linux：`~/.agent-harness.env`
- Windows：`C:\Users\<你的用户名>\.agent-harness.env`

放在主目录而不是项目里，是为了让 key 不落在被 agent 修改的仓库中。也可以用 `--env-file <path>` 指定别的文件（指定了但文件不存在会直接报错退出）。

需要的变量：

| 变量 | 是否必需 | 用途 |
| --- | --- | --- |
| `AGENT_API_KEY` | 必需 | 作为 `Authorization: Bearer <key>` 发给模型 API |
| `AGENT_BASE_URL` | 必需 | API 基础地址；CLI 请求 `${AGENT_BASE_URL}/chat/completions`（结尾的 `/` 会被去掉） |
| `AGENT_MODEL` | 不传 `-m/--model` 时必需 | 模型 ID |
| `AGENT_THINKING` | 可选 | 目前只接受 `disabled`：显式关掉 DeepSeek 的 thinking（不设置就什么都不发）。其他值会直接报错退出 |

文件内容示例（将 API 地址、模型 ID 和占位 Key 替换为你自己的配置）：

```env
AGENT_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AGENT_BASE_URL=https://api.deepseek.com
AGENT_MODEL=deepseek-flash
AGENT_THINKING=disabled
```

几点说明：

- 这些变量也可以直接作为环境变量提供（`export AGENT_API_KEY=...` / `$env:AGENT_API_KEY="..."`）。**已经存在的环境变量优先**，不会被 env 文件里的同名变量覆盖。
- `run_command` 启动子进程时会把所有 `AGENT_` 开头的变量删掉，不会把 key 交给模型能执行的命令。
- 仓库根目录的 `.env` **不是** CLI 读的那份（CLI 只读主目录的 env 文件或 `--env-file`）。`src/examples/` 下的示例是从 `process.env` 读配置的。

## 启动与注册 ts-coding-agent 命令

从源码构建后，在仓库根目录直接启动，无需配置 PowerShell Profile 函数或 shell alias：

```bash
node dist/cli.js --help
node dist/cli.js "任务描述"
```

在其他 Git 仓库中使用时，指定构建入口的绝对路径：`node <仓库绝对路径>/dist/cli.js "任务描述"`。当前不发布 npm 包，以下命令从本地源码安装。

### 可选：用 `package.json` 的 `bin` 字段全局安装（Windows / macOS / Linux 通用）

在仓库根目录执行：

```bash
pnpm add -g .
```

这会把 `ts-coding-agent` 装进 pnpm 的全局 bin 目录（Windows 上会生成 `ts-coding-agent`、`ts-coding-agent.cmd`、`ts-coding-agent.ps1` 三个 shim）。前提是那个目录在 `PATH` 里，否则会报：

```
Error: ERR_PNPM_GLOBAL_BIN_DIR_NOT_IN_PATH
help: Run "pnpm setup" to update your shell configuration.
```

遇到这个就按提示跑 `pnpm setup`，然后重开终端。卸载用 `pnpm remove -g ts-coding-agent`。

注意：pnpm 12 里 `pnpm link --global` 已经不可用（会报 `unexpected argument '--global'`），用上面的 `pnpm add -g .`。

## 用法和选项

```bash
ts-coding-agent "修复 tests/foo.test.ts 里失败的测试"
ts-coding-agent -w ../some-repo "解释 src/agent/agent-loop.ts 的用途"
ts-coding-agent -m deepseek-flash "跑一遍测试，并说明失败原因"
```

选项：

| 选项 | 说明 |
| --- | --- |
| `-w, --workspace <dir>` | 工作目录，默认当前目录。目录必须存在，而且必须在 Git 仓库里 |
| `-m, --model <id>` | 模型 ID，覆盖 `AGENT_MODEL` |
| `--env-file <path>` | API 配置文件，默认主目录的 `.agent-harness.env` |
| `--context-window <n>` | 工作预算（不是模型上限），估算超过就压缩；默认 128000，调小可用来测试压缩。必须是不小于 8000 的整数 |
| `-c, --continue` | 继续这个 workspace 最近的会话 |
| `-r, --resume` | 从这个 workspace 的会话列表里选一个继续（需要交互式终端） |
| `--session <id>` | 按会话 ID 前缀继续指定的会话（`-r` 列表显示前 8 位） |
| `-h, --help` | 显示帮助 |

任务描述是位置参数：多个位置参数会用空格拼成一个任务。所有文件工具的相对路径都相对 workspace 根目录，`run_command` 也在 workspace 根目录执行。

不写任务描述时进入**交互模式**（见下一节）。`-c` / `-r` / `--session` 只决定用哪个会话，和「跑一次还是交互」无关：

- **写了任务描述**：先接上选中的会话（`-c` / `-r` / `--session` 都会这样做），再跑一个任务后退出，不进入交互模式。
- **不写任务描述**：进入交互模式，会话是 `-c` / `-r` / `--session` 指定的那个（没指定就开新会话），之后每个任务都写进同一个会话。
- 三者只能选一个，同时给多个会直接报错退出；`-c` 在该 workspace 没有记录时会打印一行提示并开新会话。

**非交互环境**（stdin 不是 TTY，例如管道、重定向、CI）里不能进入交互模式，规则是：

- 没写任务描述时直接退出码 1 结束：没给 `-c` / `-r` / `--session` 时打印帮助，给了则报错「缺少任务描述：非交互环境里请把任务写在命令里」。
- `-r` 需要在交互式终端里选会话，所以在这种环境下配合任务描述也无法使用（会提示改用 `--session <id>`）。
- 非交互环境里命令确认一律按拒绝处理。

agent 可用的工具：`list_directory`、`read_file`、`search_text`、`write_file`、`edit_file`、`run_command`。

## 交互模式

不写任务描述、且在交互式终端（stdin 是 TTY）里运行时，CLI 进入交互模式：可以连续输入多个任务，它们共用同一个会话文件。

- 输入任务后回车就运行，提示符是 `> `（前面先打印一行说明，以及 `workspace` / `model` / `thinking` / `session` / `context` 等启动信息）。续接已有会话时，进入循环前会先打印一行 `上次的最后一条：...`，让你确认接的是哪个会话。
- **只按回车（空行、纯空白）会被忽略**，不退出也不运行任务，继续等下一次输入。
- 输入 `/exit` 退出；`Ctrl+C` 或 `Ctrl+D` 也会退出（`Ctrl+D` 相当于输入流结束）。
- **任务运行中按 `Ctrl+C` 只中止当前任务**（同时会杀掉正在运行的命令），回到提示符，可以接着输入下一个任务。想强制退出就连按两次 `Ctrl+C`（退出码 130）。
- 每个任务结束时都会打印这个任务的统计：`模型调用次数`、`执行过的工具`，以及 token 用量（有数据时才打印）。这些统计是**按任务**的，每个任务开始时清零。
- 交互模式里退出时，如果跑过**多于一个**任务，会额外打印一行「本次共 N 个任务：」和所有任务的 token 合计。

预算也是按任务算的（最多 50 次模型调用、120 次工具调用）：交互模式里每个任务都重新计数，上一个任务用掉的额度不会留给下一个任务。

### 命令

**以 `/` 开头的输入都是命令**，不会发给模型；不认识的命令只提示 `未知命令：...`，也不会发给模型。这些命令只在交互模式里有，**单次运行模式（写了任务描述）没有命令**：参数里以 `/` 开头的内容都只是任务文本的一部分。用 `/help` 可以看到同样的列表：

| 命令 | 说明 |
| --- | --- |
| `/help` | 显示命令列表 |
| `/new` | 结束当前会话，开始一个新会话（并打印上一个会话的路径和回到它的方法） |
| `/resume [id前缀]` | 切换到这个 workspace 的另一个会话；不写 id 就从列表里选（前缀能匹配多个会话时会要求你多写几位） |
| `/compact [额外要求]` | 立即压缩当前会话的上下文，可以附带对总结的要求（额外要求会加进 summary 提示里） |
| `/session` | 显示当前会话的文件、会话 id、消息数和上下文大小 |
| `/undo` | 撤销最近一个任务对文件的修改（见「撤销（/undo）」） |
| `/exit` | 退出（别名 `/quit`） |

`/compact` 会发起一次模型请求来生成 summary，运行期间按 `Ctrl+C` 可以中止压缩（打印 `已中止。`），本次不压缩、会话和上下文保持原样，回到提示符。

## 撤销（/undo）

交互模式里的 `/undo` 用来回退 agent 对文件的修改。

- **只跟踪 `write_file` 和 `edit_file`。** `run_command` 改动的文件不在其中（比如 `pnpm format` 重排过的文件），只能用 `git diff` / `git restore` 处理。
- **每个任务是一个撤销单元。** `/undo` 撤销「最近一个还没撤销、且确实改动了文件的任务」的全部文件改动，并记进会话；连续执行 `/undo` 会一个任务一个任务地往前退。一个任务结束时和任务开始时内容相同的文件不算改动（改了又改回原样除外）。
- **执行前会先列出文件并要求确认**（默认 `[y/N]`，只有在终端里手输 `y` 才执行）。列表里会说明每个文件是「恢复到任务开始前」还是「删除（这个任务新建的）」。
- **冲突会标出来。** 某个文件在任务结束后又被改过（你手动改的、`run_command` 改的，或者被删了），那一行会带 `⚠ 任务之后又被改过，恢复会覆盖这些改动`；撤销照常执行，但会覆盖这些更晚的改动。
- **任务新建的文件会被删除**（撤销前那个文件不存在）。
- **撤销不改变对话记录。** 对话里仍然留着那些编辑，所以**下一次任务开始前会自动发一条说明告诉模型哪些修改被撤销了**（终端也会打印一行 `（已在这次任务前告诉模型：之前的修改被撤销了）`），让模型不要以为那些改动还在。
- **撤销记录保存在会话文件里**（`file_change` / `undo` 条目，见「会话记录」），所以退出后用 `ts-coding-agent -c` 回来仍然可以继续往前撤销。
- **撤销不能替代 Git。** 它只覆盖它自己跟踪的写工具改动，不覆盖 `run_command`、也不覆盖你已经 commit 的内容；提交前仍然要用 `git diff` 审查。

## 运行时会看到什么

启动时按顺序打印：

- `workspace:` 实际的 workspace 根目录（绝对路径；工作区有未提交改动时，在此之前还有一条警告）
- `model:` 模型 ID
- `thinking:` `disabled`，或没设置时的 `(provider default)`
- `session:` 会话文件路径；续接会话时形如 `继续 <路径>（N 条消息）`，只有这个会话压缩过才会多出「，已压缩过」
- `context:` 压缩配置，`window=` / `reserve=` / `keepRecent=`
- 单任务模式下紧接着打印 `task:` 和任务描述；交互模式则改为打印交互模式说明

运行过程中：

- 每次调用模型之前都会打印一行 `[context] est=... threshold=...`（当前的估算 token 和压缩阈值），不只是触发压缩时才打印
- 还有 logger 打印的流程日志：每轮 `[turn N] start` / `[turn N] end`；每次模型调用 `[model start]`（含 call/turn/model/messages）与 `[model end]`（含 `stopReason=` 和 `in=` `cached=` `out=`）；每次工具调用 `[tool start]`（含工具名和参数）与 `[tool end]`（含 `error=`）；整个任务结束 `[run end] status=...`
- 每轮结束时打印模型输出的 `[assistant] ...` 文本；`run_command` 的输出会单独成块（`----- run_command output -----`）打印
- 触发压缩时打印 `[compaction #N]` 和 summary 全文；压缩失败打印 `[compaction failed] ...` 后继续运行
- 模型报错打印 `[model error] ...`；达到预算上限打印 `[stopped] ...`；被中止打印 `[中止] ...` 和 `已中止。`；意外错误打印 `[error] ...` 和堆栈

结束时（每个任务结束时都打印一次，见上一节）：

- `模型调用次数：`、`执行过的工具：`，以及 token 用量（`input` / `cachedInput` / `output` / `peakInput`，有压缩时还有压缩用的 token 和合计）
- 交互模式下跑过多个任务时，额外打印全部任务的 token 合计
- 会话文件存在时打印 `会话记录：<路径>` 和 `继续这个会话：ts-coding-agent -c`
- 最后打印 `请检查改动：git diff；满意再 commit，不满意用 git restore . 回滚。`

退出码：

- 单次运行（写了任务描述）被 Ctrl+C 中止：`130`
- 交互模式：任务被 Ctrl+C 中止只回到提示符，之后正常退出（`/exit`、Ctrl+C 或 Ctrl+D）仍然是 `0`；连按两次 Ctrl+C 强制退出才是 `130`
- 出现意外错误（打印 `[error]` 和堆栈）时退出码是 `1`；交互模式里这个退出码会保留到最终退出（后面的任务成功也不会把它清掉）
- 其他情况正常结束为 `0`（包括触发预算上限）

## 安全须知

请把 `run_command` 当成「你自己在终端里敲这条命令」来对待。

- **只在 Git 仓库里运行。** 启动时用 `git status --porcelain` 检查工作目录；不在 Git 仓库里（或没装 git）就直接退出。这样 agent 的改动才能用 `git diff` 审查、用 `git restore` 回滚。
- **运行前先 commit。** 工作区有未提交改动时只会打印一条警告，不会阻止你。先 commit 才能把 agent 的改动和你的改动分开审查。
- **白名单外的命令需要确认。** 只有下面这些命令可以不问就执行（前缀匹配）：
  `pnpm test`、`pnpm typecheck`、`pnpm build`、`git status`、`git diff`、`git log`、`git show`。
  包含 `;` `&` `|` `<` `>` `` ` `` `$` `(` `)` `^` `%` 或换行的命令（能串联命令、重定向、展开变量）一律要确认；带 `--output` 的一律要确认（`git diff --output` 会写文件）。确认提示默认是 `N`，只有在终端里手输 `y` 才放行；非交互环境（stdin 不是 TTY）一律拒绝。
  **这不是安全隔离**：白名单里的 `pnpm test` 会执行测试文件，模型可以先写文件再执行。它的作用是防意外，并让每条命令都在你眼前经过。
- **`run_command` 没有沙箱。** 它用 `shell: true` 执行，Windows 是 `cmd.exe`，macOS/Linux 是 `/bin/sh`，工作目录是 workspace 根目录。它只能删掉子进程环境里的 `AGENT_*` 变量，除此之外几乎没有限制：能读写你账号能读写的任何东西。命令不能读交互输入（stdin 是 `ignore`）；默认超时 60 秒（可用 `timeoutSeconds` 调到最多 600 秒），超时会连整棵进程树一起杀掉；返回给模型的输出只保留最后 200 行 / 20000 字符。
- **文件工具被限制在 workspace 内。** 路径相对 workspace 根目录解析，指向 workspace 之外的路径会被拒绝；路径中现有组成部分的符号链接会被检查并拒绝。这是路径检查，不是操作系统级安全隔离，也不能防止检查后路径被其他进程替换。
- **文件工具拒绝写入 `.git` 目录内部**（包括子目录，以及 worktree 的 `.git` 指针文件）。放在那里的改动 `git diff` 看不到，而且 Git hooks（`.git/hooks/` 下的脚本）会在你执行 git 时自动运行——等于让 agent 有机会写入一段你之后会自动执行的代码。需要改 Git 相关的配置时，让模型告诉你怎么做，由你自己动手。
- **任务运行中按 `Ctrl+C` 后，同一批里还没开始的工具调用都会跳过**：不再询问（不会弹确认提示），也不再执行，模型只会收到一条说明这些调用没有运行的失败结果。已经开始的那个工具调用会跑到被中止为止。
- **用 `git diff` 审查改动，不满意就 `git restore .` 回滚。** CLI 不会自动提交，结束提示也会提醒你这么做；system prompt 里也禁止模型执行 `commit` / `push` / `reset` / `checkout` / `rebase` / `clean` 这类会改历史、分支或远程的命令。

## 开发

```bash
pnpm install       # 安装依赖
pnpm build         # 编译到 dist/（tsconfig.build.json）
pnpm typecheck     # 只做类型检查，不产出（tsconfig.json，包含 tests/）
pnpm test          # vitest run
pnpm test:watch    # vitest watch
```

- `tsconfig.json` 是 `noEmit` 的类型检查配置，覆盖 `src/` 和 `tests/`；`tsconfig.build.json` 继承它并输出到 `dist/`。
- 测试在 `tests/`（vitest）。

## 会话记录

每次运行都会把会话写成一个 JSONL 文件（第一行是元信息，之后每条记录一行）。除了消息，还有三种记录：`compaction`（压缩：summary 和裁剪点）、`file_change`（一次写工具调用改动的**完整前后内容**，`/undo` 用）、`undo`（哪个任务的文件改动已经恢复）。所以**会话文件可能包含被修改文件的全部内容**，和读过的文件内容一样，都是敏感数据。

- 根目录：`~/.agent-harness/sessions/`
- 每个 workspace 一个子目录，名字由工作目录路径改写而来（去掉开头的 `/` 或 `\`，再把 `/` `\` `:` 换成 `-`，例如 `--F--学习资料-agent-harness--`）
- 文件名形如 `<时间戳>_<uuid>.jsonl`

所以会话记录和 key 一样放在主目录，不落在被 agent 修改的仓库里。

- `-c` 选的是该 workspace 下**最近活动**（文件 mtime 最新）的那个会话
- `-r` 需要交互式终端：先列出最近活动的 20 个会话（每行显示活动时间、id 前 8 位、消息条数、是否压缩过，以及首条/最后一条用户消息），再提示「继续哪一个？输入编号（直接回车取消）」；直接回车或输入无效编号都会打印「已取消。」并以退出码 0 结束。更早的会话不会列出，用 `--session <id>` 按 id 前缀指定（前缀能匹配多个会话时会要求你多写几位）

`-c` / `-r` / `--session` 只是选会话（见「用法和选项」）：不写任务描述就进入交互模式，写了任务描述就跑一次后退出。启动和结束时都会打印会话文件路径，结束时还会提示用 `ts-coding-agent -c` 继续这个会话。

代码结构：

| 目录 | 内容 |
| --- | --- |
| `src/cli.ts` | CLI：参数解析、env 文件、Git 检查、交互模式、命令确认、终端输出 |
| `src/agent/` | Agent、agent loop、extension 与 hook 机制 |
| `src/ai/` | 统一消息类型、事件流，`src/ai/providers/openai-compatible.ts` 是 OpenAI-compatible provider |
| `src/checkpoint/` | `file-change.ts`（写入前后的快照）、`undo.ts`（撤销计划、冲突检查、恢复） |
| `src/context/` | `compaction.ts`（压缩：裁剪点、summary、checkpoint）、`token-estimate.ts`（token 估算与从消息里取文本） |
| `src/session/` | `session-store.ts`（JSONL 会话读写、列表、重建）、`sanitize-for-llm.ts`（发给模型前整理历史：去掉出错或中止的回复，补齐缺失的工具结果） |
| `src/tools/` | 六个工具：list_directory、read_file、search_text、write_file、edit_file、run_command |
| `src/extensions/` | `budget.ts`（调用次数预算）、`command-approval.ts`（命令白名单与确认） |
| `src/prompts/` | coding system prompt |
| `src/logging/`、`src/trace/` | 日志输出、trace 采集 |
| `src/examples/` | 直接调用 API 的小例子（从 `process.env` 读 `AGENT_*` 配置） |
