<div align="center">

# 🧠 TS Coding Agent

**A Lightweight TypeScript Coding Agent Runtime**

### 让模型提出工具调用，让 Runtime 负责执行、记录与恢复

基于 **TypeScript + Node.js** 从核心运行循环出发构建的 Coding Agent。支持**流式工具调用、上下文压缩、持久化会话、命令审批与文件级撤销**，重点展示 Coding Agent 从模型交互到工程控制的完整实现。

![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24%2B-5FA04E?logo=nodedotjs&logoColor=white)
![Status](https://img.shields.io/badge/Status-v0.1.0%20Preview-orange)
![License](https://img.shields.io/badge/License-MIT-blue)

[为什么做这个项目](#-为什么做这个项目) · [功能演示](#-功能演示) · [系统架构](#-系统架构) · [快速开始](#-快速开始) · [测试与验证](#-测试与验证) · [已知限制](#️-范围与已知限制)

</div>

> **项目定位**：这是用于学习与工程实践的 **Coding Agent Runtime**，参考 [Pi](https://github.com/earendil-works/pi) 的架构思想，并非 Pi 官方发行版，也不是 Claude Code / Codex 的成熟替代品。**命令默认在本机执行**，可选隔离后端及其边界见 [Sandboxes](#sandboxes)；请先在可信、可随时恢复的测试仓库中体验。

## 🌟 为什么做这个项目

调用一次大模型 API 并不等于实现了 Coding Agent。真正的难点是：**模型如何反复调用工具、如何管理不断增长的上下文，以及执行出错或修改不符合预期后如何继续工作**。

这个项目主要围绕四个工程问题展开：

| 工程问题 | 本项目的实现 |
| --- | --- |
| **模型与工具如何形成闭环？** | 手写 Agent Loop，解析流式 Tool Call，校验参数、执行工具并将结果返回模型；通过 Hook / Extension 插入预算控制、审批与日志 |
| **长任务如何控制上下文？** | 结合 Provider 返回的实际 Token Usage 与本地估算，在阈值处生成结构化总结；支持自动及手动 `/compact`、截断重试与压缩状态恢复 |
| **关闭终端后如何继续任务？** | 只追加的 JSONL Session 保存消息与压缩检查点；支持 `/resume`、`-c` 和按会话 ID 恢复 |
| **Agent 修改错了文件怎么办？** | 为 `write_file` / `edit_file` 记录任务级前后快照；`/undo` 支持跨进程恢复与冲突检查，不改动 Git 提交历史 |

项目采用小步提交、测试先行的方式开发，目的不仅是让 Agent 能运行，更是让关键行为可解释、可验证。

## 📸 功能演示

> 以下是**操作示例**，不是终端录屏或真实模型输出截图。正式演示素材将在后续补充；具体文字与工具调用次数由模型决定。

### 1. 代码理解与工具调用

在 Git 仓库内启动 Agent，然后输入自然语言任务：

```text
> 阅读 package.json 和 src/agent/，解释 Agent Loop 如何调用模型和工具。只读，不修改文件。

模型提出工具调用
  → read_file / list_directory / search_text
Runtime 校验并执行
  → 将 Tool Result 返回模型
模型基于读取结果回答
```

### 2. 修改文件与 `/undo`

```text
> 创建 hello.js，实现一个把两个数字相加的函数。
  → Agent 调用 write_file
  → 文件变更记录到当前任务的检查点

> /undo
  → 检查最近一个可撤销任务的文件变更
  → 如存在冲突则要求确认
  → 恢复原有文件，或删除该任务新建的文件
```

**撤销范围很重要**：`/undo` 只跟踪文件工具的修改；通过 `run_command` 执行的脚本、测试或其他命令产生的文件变更**不在撤销保证范围内**。

### 3. 会话恢复与上下文压缩

```text
> /session               # 查看会话文件、消息数及上下文估算
> /compact 保留关键设计决策   # 手动生成上下文总结（有可压缩内容时）
> /exit

# 下次在同一工作目录中继续
node /path/to/ts-coding-agent/dist/cli.js -c
```

会话文件存放在用户目录中，而不是目标项目仓库；恢复会话时会重建消息及压缩状态。

## 🏗️ 系统架构

```mermaid
flowchart TB
    U["用户 / CLI · REPL"] --> A["Agent · 任务与状态"]
    A --> L["Agent Loop"]

    L --> C["Context · Token 估算与 Compaction"]
    C --> P["OpenAI-compatible Provider"]
    P <--> M["LLM API"]
    P --> L

    L --> H["ExtensionHost · Lifecycle Hooks"]
    H --> B["Budget · Command Approval · Logger"]
    H --> T["内置工具"]
    H --> MT["MCP 适配层"]
    T --> L
    MT --> L
    MT --> MC["MCP Client"]
    MC <-->|stdio| MS["MCP server · 本机进程"]
    SK["Skill 目录 · .agent/skills/"] --> SP["System prompt · Skill 名称、描述、路径"]
    SP --> L

    A --> E["Agent Events · subscribe"]
    E --> S[("JSONL Session")]
    T --> F["文件改动前后快照"]
    F --> S
    U --> D["/undo · 冲突检查与恢复"]
    D --> S
```

**关键设计边界：**

- **模型负责提出调用，Runtime 负责实际执行**：工具 Schema 使用 TypeBox 描述与校验，`execute()` 不会发送给模型。
- **Hook 与 Event 不是同一回事**：Hook 可以在调用前拦截或确认，订阅事件主要负责日志、状态展示和会话持久化。
- **压缩不删除原始 Session 历史**：模型使用压缩视图；会话文件保留追加记录及检查点，方便恢复。
- **命令审批不等于沙箱**：文件工具有工作区和敏感路径保护，但 `run_command` 仍可能访问工作区外的文件。

**AgentView 界面层**：`cli.ts` 只通过 `AgentView` 和界面打交道，`PlainView` 与 `TuiView` 是它的两个实现。工具状态和工具输出来自结构化的 Agent 事件，由 `tool-activity.ts` 按调用 ID 转交给 view；CLI 不解析日志文字来判断工具的状态。

### 核心代码位置

| 模块 | 主要文件 | 职责 |
| --- | --- | --- |
| Agent Runtime | `src/agent/agent.ts`、`agent-loop.ts` | Agent 状态、模型—工具循环、取消与生命周期 |
| Model Provider | `src/ai/providers/openai-compatible.ts`、`event-stream.ts` | 请求适配、SSE 解析、事件流 |
| Context | `src/context/compaction.ts`、`token-estimate.ts` | Token 预算、上下文视图与压缩 |
| Tools | `src/tools/` | 文件读写、目录查看、搜索、命令执行与路径约束 |
| Skills | `src/skills/` | 扫描与校验 Skill 目录、控制是否注入提示词 |
| MCP | `src/mcp/` | 配置与信任、stdio 连接、工具适配和调用审批 |
| Extensions | `src/extensions/`、`src/agent/extension-host.ts` | 预算、命令确认和 Hook 调度 |
| Sessions | `src/session/session-store.ts` | JSONL 追加记录、会话列表与恢复 |
| Undo | `src/checkpoint/` | 文件改动记录、冲突检测、任务级撤销 |
| CLI | `src/cli.ts` | 参数、交互命令、会话选择、日志与中止处理 |
| UI | `src/ui/` | 普通终端与 TUI 的共同界面、工具活动展示 |
| UI 接口 | `src/ui/agent-view.ts` | `AgentView`：输出、输入、审批、中止与界面生命周期 |
| UI 实现 | `src/ui/plain-view.ts`、`src/ui/tui-view.ts` | 普通终端与基于 pi-tui 1.3.0 的全屏界面 |
| UI 事件适配 | `src/ui/answer-stream.ts`、`src/ui/tool-activity.ts` | 流式回答、结构化工具事件转为 view 调用 |
| UI 展示组件 | `src/ui/tool-group.ts`、`src/ui/status-text.ts` | 工具活动分组、审批记录、详情折叠与 Token 数格式化 |

## 🧰 技术栈

| 领域 | 技术 | 用途 |
| --- | --- | --- |
| 运行时 | TypeScript、Node.js、ESM | Agent Core 与命令行程序 |
| 模型通信 | OpenAI-compatible Chat Completions、SSE | 流式生成与 Tool Calling |
| 工具参数 | TypeBox | Schema、静态类型推导与运行时校验 |
| 会话管理 | JSONL | 追加式消息记录、压缩检查点与恢复 |
| 自动化测试 | Vitest、TypeScript Compiler | 运行时回归与严格类型检查 |
| 包管理与构建 | pnpm、`tsc` | 依赖安装与 `dist/` 构建 |

## 🚀 快速开始

以下步骤以 Windows PowerShell、Node.js **24+** 为例。Beta 尚未发布到 npm；目前请从源码运行，或在本地打包后全局安装。

### 1. 从源码运行

```powershell
git clone https://github.com/Jmiao11/ts-coding-agent.git
cd ts-coding-agent

# 若尚未安装 pnpm，可先执行：npm install -g pnpm@12.5.1
pnpm install --frozen-lockfile
pnpm build
node dist/cli.js --help
```

> 源码构建固定使用 pnpm 12.5.1。

### 2. 本地打包后全局安装

npm 包尚未发布。可以在源码根目录打包，再到仓库目录之外安装（仓库的 `devEngines` 要求 pnpm，在仓库目录里运行 npm 可能被拒绝）：

```powershell
pnpm pack          # 会先执行 clean + build，生成 ts-coding-agent-0.2.0-beta.0.tgz
cd ..
npm i -g .\ts-coding-agent\ts-coding-agent-0.2.0-beta.0.tgz
ts-coding-agent --help
```

`@microsoft/mxc-sdk` 是可选依赖，会随包一起安装；它安装失败不会让整个安装失败，只是 `--sandbox mxc` 不可用。较新版本的 npm 默认不运行依赖的安装脚本；如果 `--sandbox mxc` 启动失败，可加上 `--allow-scripts=koffi,node-pty` 重新安装。

### 3. 配置自己的模型 API

CLI 默认读取**用户主目录**中的 `.agent-harness.env`，例如 Windows 的 `C:\Users\<用户名>\.agent-harness.env` 或 macOS/Linux 的 `~/.agent-harness.env`。

创建该文件并填写自己的模型凭据。以下为 DeepSeek **配置示例**，模型 ID 以服务商账户实际支持为准：

```dotenv
AGENT_API_KEY=your-api-key-here
AGENT_BASE_URL=https://api.deepseek.com
AGENT_MODEL=deepseek-flash
AGENT_THINKING=disabled
```

- `AGENT_API_KEY`、`AGENT_BASE_URL` 必需；未使用 `-m` 时还需要 `AGENT_MODEL`。
- `AGENT_THINKING=disabled` 用于显式关闭当前 DeepSeek 示例的 thinking；其他 OpenAI-compatible 服务通常可以不设置。
- 也可直接设置环境变量，或使用 `--env-file <path>` 指定配置文件。
- **不要提交密钥**。运行中的命令不等于安全沙箱；不应在不可信工作区执行 Agent。

### 4. 在测试 Git 仓库启动

为安全起见，先创建一个单独的演示目录。在 `ts-coding-agent` 源码根目录运行：

```powershell
New-Item -ItemType Directory -Force ..\ts-coding-agent-demo | Out-Null
git -C ..\ts-coding-agent-demo init

# 从源码目录启动，指定 Agent 要操作的工作区
node dist/cli.js --workspace ..\ts-coding-agent-demo
```

看到交互提示符后，可以尝试：

```text
> 查看当前目录有什么文件，不要修改。
> 创建 hello.js，写一个 add(a, b) 函数。
> /undo
> /session
> /exit
```

如果你已经有一个项目目录，也可以从那里启动：

```powershell
# 先在 TS Coding Agent 源码目录取得 CLI 的绝对路径
$agentCli = (Resolve-Path .\dist\cli.js).Path

# 换到自己的项目目录
Set-Location 'F:\path\to\your-project'
node $agentCli
```

Linux/macOS 同理：在目标项目目录里执行 `node /absolute/path/to/ts-coding-agent/dist/cli.js`。跨平台完整验收仍在进行中。

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `node dist/cli.js "任务"` | 单次执行任务并退出（从源码目录运行） |
| `node dist/cli.js` | 启动 REPL（默认当前目录作为工作区） |
| `node dist/cli.js -w <dir>` | 指定工作区 |
| `node dist/cli.js -c` | 继续当前工作区最近一次会话 |
| `node dist/cli.js -r` | 从当前工作区的会话列表中选择 |
| `node dist/cli.js --session <id>` | 通过会话 ID 前缀恢复 |
| `node dist/cli.js --no-skills` | 不扫描或注入工作区 Skills |
| `node dist/cli.js --no-mcp` | 不加载 MCP 配置或工具 |
| `node dist/cli.js --plain` | 强制普通逐行输出（交互终端里默认是 TUI） |
| `node dist/cli.js setup [--env-file <path>]` | 首次运行引导：模型配置、连通测试和默认设置 |
| `node dist/cli.js config list` | 显示每项设置、来源和可选值 |
| `node dist/cli.js config get <key>` | 显示一项设置 |
| `node dist/cli.js config set <key> <value>` | 校验并保存一项设置 |
| `node dist/cli.js config path` | 显示设置文件路径 |
| `/help` | 查看 REPL 内命令 |
| `/config` | 查看设置；`/config set <key> <value>` 修改设置 |
| `/new` | 新建会话 |
| `/resume` | 选择和恢复会话 |
| `/compact [要求]` | 手动压缩上下文；保留最近消息 |
| `/session` | 查看当前会话及上下文使用情况 |
| `/mcp` | 查看 MCP server 状态及工具名 |
| `/undo` | 撤销最近一次符合条件的文件工具改动 |
| `/exit` | 退出交互模式 |

> `node dist/cli.js` 是**从源码根目录**运行的命令；在其他目录启动时，请使用 CLI 入口的绝对路径。全局安装后（见「本地打包后全局安装」），命令名为 `ts-coding-agent`。

设置文件是 `~/.agent-harness/config.json`（与 `mcp.json` 在同一目录），保存 `ui`、`sandbox`、`nonGitDirectory` 的默认值；命令行参数优先。`config set` 会先校验取值再保存。`nonGitDirectory` 决定工作区不是 Git 仓库时怎么处理，见[不在 Git 仓库里运行](#不在-git-仓库里运行)。任务本身名叫 `config` 时，用 `--` 隔开：`node dist/cli.js -- config`。

## 首次使用

第一次使用可以运行首次运行引导：

```powershell
ts-coding-agent setup
```

引导依次询问 Base URL、API Key、模型 ID，并用 `GET {baseUrl}/models`（404 时改用最小的 chat completion）做一次 15 秒超时的连通测试；失败时可以选择仍然保存。随后询问 `ui`、`sandbox`、`nonGitDirectory`，选过不同值才写入 `~/.agent-harness/config.json`。API Key 输入时不回显，只显示字符数；它只写入 env 文件（默认 `~/.agent-harness.env`，可用 `--env-file` 指定），不会出现在屏幕输出、日志、会话文件或 system prompt 里。env 文件里的其他变量、注释和换行符会原样保留。

交互模式（没有任务描述）、stdin 和 stdout 都是 TTY 时，如果读完 env 文件后仍缺少 `AGENT_API_KEY`、`AGENT_BASE_URL` 或 `AGENT_MODEL`，启动前会问一次「还没有配置模型，现在设置吗？[Y/n]」，答是就进入同一个引导。一次性任务或非 TTY 环境不会自动触发，仍按原来的缺少配置报错，并提示运行 `ts-coding-agent setup`。

## 不在 Git 仓库里运行

工作区不是 Git 仓库时，按 `~/.agent-harness/config.json` 里的 `nonGitDirectory` 处理：

| 值 | 行为 |
| --- | --- |
| `ask`（默认） | 交互模式下询问：1) 在这里运行 `git init`（推荐）；2) 不用 Git，直接运行；3) 退出。选 1 或 2 后，可以再回答一次是否保存为以后的默认设置 |
| `init` | 自动在工作区执行 `git init` 后继续启动（不会自动 commit） |
| `allow` | 不用 Git 直接启动；每次启动都警告改动无法用 `git diff` 审查 |

受保护的目录（磁盘根目录、用户主目录及其上级目录、系统目录）不允许 `git init`，也不会按 `allow` 静默运行：交互模式下只提供「不用 Git，直接运行 / 退出」，非交互模式直接拒绝。判断前会用 `realpath` 展开 8.3 短路径和符号链接，避免绕过保护。

不在 Git 仓库里运行时，`/undo` 仍然可以撤销 `write_file` / `edit_file` 的改动；`run_command` 产生的文件改动无法回滚。用 `ts-coding-agent config set nonGitDirectory ask|init|allow` 修改策略。

## 交互界面

**TUI 现在是默认界面，但只在交互式终端里生效**：没有任务描述、且标准输入和标准输出都是 TTY 时自动启用。一次性任务、管道或重定向会自动使用普通终端，逐行输出全部诊断日志；`--plain` 可以显式关闭 TUI。

`--tui` 仍然保留，用来明确要求全屏界面；它要求标准输入和标准输出都是 TTY，否则报错。`--tui` 和 `--plain` 不能同时使用。

```powershell
node dist/cli.js --plain --workspace <Git工作区>
```

TUI 以 `❯` 显示你提交的任务，以 `●` 显示 Agent 的回答。工具调用按任务分组，成功的工具输出默认收起；失败的工具和你审批过的命令始终显示。等待审批时，问题显示在工具组内；回答后保留“你允许了 / 你拒绝了”的记录。底栏显示工作区、模型、沙箱与累计 Token 用量。

| 按键 / 命令 | 行为 |
| --- | --- |
| Enter | 发送输入框中的任务 |
| Ctrl+C | 任务运行中中止当前任务；在输入框等待任务时退出；审批时中止任务并拒绝命令。任务中连按两次可强制退出 |
| Ctrl+D | 输入框为空时退出 |
| Ctrl+O | 展开或收起最近一组工具调用；输入框有文字或正在等待审批时也可使用，不会改变输入或回答审批 |
| y | 审批时允许命令；其他按键视为拒绝（Ctrl+O 只切换详情） |
| `/debug` | TUI 中切换诊断日志，新日志以暗色显示；普通终端始终显示诊断日志，开关无效 |
| `/config` | 查看设置；`/config set <key> <value>` 校验后保存。ui / sandbox 下次启动生效，nonGitDirectory 下次进入非 Git 目录时生效 |
| `/help` | 查看交互命令及界面快捷键 |

## Skills

工作区中的 Skill 放在 `.agent/skills/<name>/SKILL.md`，遵循 [Agent Skills 规范](https://agentskills.io/specification)。文件的 YAML frontmatter 必须有 `name` 和 `description`；`name` 要与所在目录名一致。格式不符合要求的 Skill 会被跳过并给出警告，不会阻止 Agent 启动。

Skills 使用渐进式披露：启动时，system prompt 只列出每个 Skill 的名称、描述和路径；模型判断需要时，再调用 `read_file` 读取 `SKILL.md` 全文。没有 Skill 时，system prompt 与此前逐字节相同；`--no-skills` 可关闭目录扫描和提示词注入。本仓库附带来自 `anthropics/skills` 的 `mcp-builder` 和 `frontend-design`，其许可为 Apache-2.0，见 [第三方声明](THIRD_PARTY_NOTICES.md)。对固定版本的 `anthropics/skills` 运行 `node scripts/check-skill-compat.mjs F:\skills-src`，**19 个里能加载 18 个**；`claude-api` 的 description 超过 1024 个字符，被跳过。加载名单、警告和来源提交见 [兼容性记录](evals/skills-compat-2026-10-20.md)。

触发评测可在完成构建并配置模型 API 后运行 `node scripts/eval-skills.mjs --repeat 2`。题目在 [evals/skills.json](evals/skills.json)，包括隐式触发题和不该读取 Skill 的陷阱题；脚本从会话 JSONL 中统计工具调用与 Token 用量。修改提示词前，触发判断为 **21/24**，其中 j 题两次都未读取 `mcp-builder`，记录显示模型认为自己已经会了；按评测结果修改提示词后，独立抽查 j、g、l 为 **3/3**，每题只运行一次，样本很小。命令、逐题输出和解释见 [触发与 A/B 记录](evals/skills-k4c-run-2026-10-19.md)，较早的一轮见 [首次触发记录](evals/skills-run-2026-10-19.md)。

旧 A/B 的 `--no-skills` 对照组被污染：模型通过 `list_directory` 等文件工具自行找到了 Skill 并读取。因此目前不能据此得出回答质量或 Token 节省方面的结论；已有记录显示，读取 Skill 的一侧输入 Token 增加，但差额还包含后续工具调用的影响。Skill 与仓库中的其他文件一样作为可读取的上下文，不能覆盖 system prompt 中的规则。

## MCP

目前只支持本机 **stdio** MCP server，客户端依赖官方 `@modelcontextprotocol/client` **2.3.1**；尚不支持远程 HTTP、OAuth，以及 MCP resources 和 prompts 接口。server 暴露的工具会适配成 Agent 工具，名字为 `mcp__<server>__<tool>`。启动时显示各 server 的工具数与按工具定义长度估算的 Token 数；REPL 中用 `/mcp` 查看连接、失败或跳过状态和工具名，用 `--no-mcp` 完全关闭 MCP 配置加载。

用户级配置是 `~/.agent-harness/mcp.json`，项目级配置是工作区根目录的 `.mcp.json`；两者都使用 `mcpServers`。同名时用户级配置优先，并给出警告。例如 Windows 上的 filesystem server：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "F:\\mcp-probe"],
      "env": {},
      "cwd": "F:\\mcp-probe",
      "tools": ["list_directory", "read_text_file", "write_file"],
      "autoApprove": ["list_directory", "read_text_file"]
    }
  }
}
```

`command` 是可执行程序；`args` 是传给它的参数；`env` 是额外传给 server 的环境变量，可用 `${VAR}` 从启动 Agent 的宿主机环境取值，缺少变量时会跳过该 server 并警告；`cwd` 是 server 的工作目录，省略时使用工作区根目录；`tools` 是允许暴露给 Agent 的**原始工具名**列表，省略时启用全部；`autoApprove` 是无需逐次审批的原始工具名列表，省略时不自动批准。示例中的只读工具免审批，`write_file` 仍需审批。

项目级 server 首次启动前需要交互确认。信任记录保存在 `~/.agent-harness/mcp-trust.json`，按工作区路径、server 名及 command、args、env **键名**、cwd 的哈希识别配置，不记录 env 的值；命令等内容改变后会重新询问信任。一次性任务模式或没有 TTY 时，未获信任的项目级 server 会直接跳过并给出警告。所有 MCP 工具调用默认都要审批，只有用户在 `autoApprove` 中明确列出的工具例外。

### 安全边界

- MCP server 是本机进程，**不受 `--sandbox` 隔离**。
- MCP 工具可绕过 `/undo` 的文件快照，以及内置文件工具对工作区和 `.env` 的保护；对这类调用，逐次审批或用户明确配置的 `autoApprove` 是现有防线。只给可信 server 配置自动批准。
- MCP 返回结果在 system prompt 中被要求当作数据，而不是指令；这只是提示词层面的约束，**不是强制保证**。
- server 默认只收到 SDK 白名单内的宿主环境变量，以及配置中明确写出的 `env`，不会继承完整的进程环境。

连接失败只会给出警告，Agent 继续启动：缺少 MCP 工具不会降低已有工具的安全边界；选定的沙箱若启动失败则必须拒绝运行，以免命令落到本机执行。本仓库 `package.json` 的 `devEngines` 要求使用 pnpm；在仓库目录里用 `npx` 启动 server 会被 npm 拒绝。可像上例那样把 `cwd` 设为仓库外的英文路径。

## Sandboxes

用 `--sandbox` 选择 `run_command` 的执行后端：

| 后端 | 平台与前提 | 执行方式 |
| --- | --- | --- |
| `host`（默认） | 项目支持的平台 | 直接在本机执行，不隔离 |
| `codex` | Windows；设置 `AGENT_CODEX_EXE` 为真实 `codex.exe` 的完整路径 | 通过 `codex sandbox` 执行 |
| `mxc`（实验性） | Windows、Node.js 24+；安装可选依赖 `@microsoft/mxc-sdk` | 直接通过 Microsoft MXC SDK 执行 |

例如：`node dist/cli.js --sandbox mxc --workspace <工作区>`。选择沙箱后，任何启动或自检失败都会拒绝运行，绝不退回本机执行。

沙箱只用于 `run_command`。`write_file` / `edit_file` 在宿主机执行，不经过沙箱，由 `workspace-path` 的检查限制可访问的路径。

### MXC 的已知限制

- 当前实测隔离等级为 `appcontainer-dacl`：运行时临时修改授权目录的权限，正常结束后撤销。默认只读授权当前 Node.js 所在目录；额外工具目录通过 `AGENT_MXC_READONLY` 配置，用分号分隔。
- 显式设置 `ui.disable=false`，允许创建窗口，以避免 Node.js 初始化失败；剪贴板访问和模拟输入已显式禁止（`clipboard: "none"`、`allowInputInjection: false`）。
- 用 `subst` 把工作区映射成盘符根目录，绕过 Git 和 Node.js 解析工作区上级目录时的访问问题，见 [microsoft/mxc#1464](https://github.com/microsoft/mxc/issues/1464)。
- 入口脚本位于工作区外的全局工具（例如全局安装的 `pnpm`）当前不能使用；需要使用工作区内的工具入口。
- SDK 本身装在含中文的路径下时无法获取隔离等级；也不能调用 `getAvailableBackends()`，否则会 panic。工作区的 `subst` 映射不会改变 SDK 的安装路径。
- 所有者不是当前用户的目录可能读不到，Git 可能把其中的文件报成“已删除”。启动时只检查工作区顶层，跳过 `.git` 和 `node_modules`，发现这类条目会给出警告，不会拒绝启动。
- Agent 被强行结束时，`subst` 映射可能残留。用 `subst` 查看映射，确认对应的盘符后手动删除，例如 `subst Z: /D`；`Z:` 只是示例，应换成实际盘符。

遇到 `CodexSandboxOffline` 等其他所有者时，按以下步骤复制替换：

1. 先关闭 PyCharm 和 Codex 桌面版，避免文件被锁住或再次由沙箱用户创建。
2. 在独立打开的普通 PowerShell 中，以当前用户把受影响的目录或文件复制到全新位置。目录可用普通的 `Copy-Item -Recurse`；不要保留原所有者或原 ACL。
3. 核对复制内容后，把原条目移到工作区外作为备份，再把新副本放回原位置和原名；对警告中的条目逐一处理，保留 `.git` 和 `node_modules`。
4. 用 `(Get-Acl -LiteralPath .\src).Owner` 等命令检查新副本，确认所有者与 `[System.Security.Principal.WindowsIdentity]::GetCurrent().Name` 一致，再重新启动 Agent。确认文件和 Git 状态正常后再处理备份。

### Codex 的已知限制

- 不拦截工作区外的读取，因此工作区外的文件仍可能被命令读到。
- Codex 桌面版运行时可能锁住沙箱需要的文件；遇到这类启动失败，可关闭桌面版后在外部终端运行。
- 会在工作区留下永久权限条目，包括 `CodexSandboxUsers` 和记录在 `~/.codex/cap_sid` 里的 SID；进程结束后不会自动撤销。

需要撤销这些权限时，先用 `icacls "<dir>"` 查看实际受影响目录，再删除对应条目：

```powershell
icacls "<dir>" /remove "CodexSandboxUsers"
icacls "<dir>" /remove "*<SID>"
```

将 `<dir>` 替换为受影响的目录，将 `<SID>` 替换为 `~/.codex/cap_sid` 中的实际 SID；数字 SID 前面的 `*` 要保留。只删除确认由 Codex 添加的条目。

## ✅ 测试与验证

在仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

**当前本地回归结果（Windows）**：`pnpm test` 的 **46 个测试文件通过，282 项测试通过、1 项跳过**。这是本地验收记录，**不是 GitHub CI 的实时状态**。

测试覆盖 Agent Loop、流事件、模型协议转换、上下文压缩、会话恢复、文件工具、命令执行、检查点、撤销、Skills、MCP、AgentView、TUI 工具分组与审批显示，以及部分安全边界。自动化测试不能替代真实模型、真实终端操作与跨平台验收。

## ⚠️ 范围与已知限制

- **命令隔离取决于后端**：默认的 `host` 不隔离，`codex` 和实验性的 `mxc` 各有边界，详见 [Sandboxes](#sandboxes)；请只在可信、可恢复的测试环境中使用。
- **MCP 配置只在启动时读取**：修改用户级 `mcp.json` 或项目级 `.mcp.json` 后，要重启 Agent 才会生效。
- **MCP 传输与认证有限**：当前只支持本机 stdio server，不支持远程 Streamable HTTP 和 OAuth。
- **工作区可以是普通目录，但有保护**：默认 `nonGitDirectory=ask`，交互模式询问，非交互模式拒绝；`init` 自动初始化，`allow` 每次警告。磁盘根目录、用户主目录及其上级目录和系统目录不会被静默运行。默认使用当前目录，也可传 `--workspace`。
- **`/undo` 不是 Git 级回滚**：只跟踪 `write_file` / `edit_file`，不能保证撤销 `run_command` 的文件副作用，也不会重写暂存区或提交历史。
- **会话记录包含上下文**：JSONL 可能保留模型读取过的代码及工具输出，不应把本地会话文件当作可以直接公开的日志。
- **模型适配范围有限**：当前主要验证 OpenAI-compatible Chat Completions 与 DeepSeek thinking disabled；未实现所有 Provider 的专有协议与 reasoning 透传。
- **交互功能范围有限**：已提供普通终端与 TUI（交互式终端里默认启用，`--plain` 可关闭）；尚未实现对话树 `/tree`、通用权限模式或多 Agent 编排。
- **TUI 仅在 Windows PowerShell 7 上实测过**：其他终端及平台的显示、输入与退出清理仍待验证。
- **Ctrl+O 只能切换最近一组工具调用**：修改已经滚进回滚区的内容会导致 pi-tui 清屏重画，因此不支持展开更早的组。
- **`/debug` 不会删除历史日志**：关闭之后，已经显示的诊断日志不会消失，只隐藏后续新日志。
- **上下文溢出恢复有限**：已支持阈值压缩及总结截断重试，但尚未对全部 Provider 的硬性 context-overflow 错误实现自动恢复。
- **跨平台仍待验证**：主要开发与本地回归在 Windows 完成，Linux/macOS 使用前请自行验证，后续将补充 CI 和干净环境验收。

## 🗺️ 后续计划

| 阶段 | 方向 |
| --- | --- |
| 已完成 | v0.1.0 Preview 的源码运行、Agent Loop、工具、上下文压缩、Session、`/undo`；沙箱（codex / 实验性 mxc）、TUI、Skills、stdio MCP 接入与审批、首次运行设置 |
| 下一步：Beta 发布 | GitHub Release 附带安装包；npm 账号可用后发布 npm beta |
| 长期探索 | 对话分支恢复、更多模型接口与安全边界 |

路线是计划，不代表已实现或承诺发布日期。

## 📄 开源许可与致谢

本仓库采用 [MIT License](LICENSE)，Copyright (c) 2026 Jmiao11。

项目参考 [Pi](https://github.com/earendil-works/pi) 的 Agent Runtime 设计与工程思路。部分压缩总结模板的结构借鉴了上游实现；相关版权及许可声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目不是 Pi 的官方发行版。
