# Changelog

## 0.2.0-beta.0（相对 0.1.0；待发布）

### Sandbox

- `run_command` 可选择 `host`、Windows 上的 `codex` 或实验性的 `mxc` 后端。
- 选定的沙箱启动或自检失败时拒绝运行，不会退回本机执行。
- MXC 使用 SDK 执行命令，并通过 `subst` 映射工作区；启动时会警告工作区顶层可能存在的所有者问题。
- 沙箱只约束 `run_command`；内置文件工具仍在宿主机执行，受工作区路径检查约束。

### TUI

- 新增 TUI 全屏界面，交互模式下（没有任务描述，stdin 和 stdout 都是 TTY）默认启用；一次性任务和非 TTY 自动使用普通终端；`--plain` 可关闭，`--tui` 在没有 TTY 时报错。
- 按任务分组显示工具调用，成功结果默认收起，失败结果与审批记录保持可见。
- 支持 Ctrl+C 中止任务、Ctrl+D 退出，以及 Ctrl+O 展开或收起最近的工具组。
- 底栏显示工作区、模型、沙箱和累计 Token 用量；`/debug` 控制后续诊断日志的显示。

### Skills

- 从工作区 `.agent/skills/<name>/SKILL.md` 扫描并校验 Skill；无效条目跳过并警告。
- 启动时只向 system prompt 注入名称、描述和路径；模型需要时通过 `read_file` 读取正文。
- 加入 `--no-skills`，可关闭 Skill 扫描与提示词注入。
- 仓库附带 `mcp-builder` 和 `frontend-design`；触发评测及兼容性检查见 README 链接的 `evals/` 记录。

### MCP

- 连接本机 stdio MCP server，发现并适配其工具；提供用户级和项目级 `mcpServers` 配置。
- 项目级 server 启动前需要信任确认；命令等配置变化后重新确认，非交互模式跳过未信任的 server。
- MCP 工具调用默认需要审批，可用 `autoApprove` 指定免审批工具。
- 新增 `/mcp` 查看连接状态和工具名，`--no-mcp` 关闭配置加载；连接失败只给出警告。

### 首次运行设置

- 新增 `~/.agent-harness/config.json`，保存 `ui`、`sandbox`、`nonGitDirectory` 的默认值；优先级为命令行参数 > 设置文件 > 内置默认值，不从环境变量读取设置。
- 新增 `config list|get|set|path` 子命令和 REPL 内的 `/config`；取值先校验再保存，设置文件无法解析时拒绝写入。`ui`、`sandbox` 下次启动生效。
- 设置文件指定的沙箱启动失败时仍然拒绝运行，并提示可用 `--sandbox host` 临时改用本机执行。
- 工作区不是 Git 仓库时按 `nonGitDirectory`（`ask` / `init` / `allow`，默认 `ask`）处理；磁盘根目录、用户主目录及其上级目录、系统目录不允许 `git init`，也不会按 `allow` 静默运行。
- 新增 `setup` 引导：配置 Base URL、API Key、模型并做连通测试；交互终端中缺少模型配置时启动前自动询问。API Key 输入不回显，只写入 env 文件。

### 已知限制

- MCP server 在本机运行，不受 `--sandbox` 隔离；其工具调用不受内置文件工具的工作区、`.env` 保护，也不进入 `/undo` 文件快照。
- MCP 配置只在启动时读取；不支持远程 Streamable HTTP、OAuth、resources 和 prompts 接口。
- TUI 目前只在 Windows PowerShell 7 上实测；其他终端和平台仍需验证。
- Skills 触发评测样本有限，旧 A/B 对照组被污染；尚无质量或 Token 节省结论。
