import { Loader, Text, truncateToWidth, visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";

const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[39m`;

type Tool = { label: string; ok?: boolean; detail?: string };
type Approval = { question: string; command: string; answer?: boolean };

/** 一步中的工具共用一个 Loader；结束后只保留摘要和失败详情。 */
export class ToolActivityGroup implements Component {
  private tools = new Map<string, Tool>();
  private skills = new Set<string>();
  private approvals: Approval[] = [];
  private loader: Loader;
  private started = Date.now();
  private elapsed = 0;
  private ended = false;
  private aborted = false;
  private current = "";
  private loaderMessage = "";
  private expanded = false;

  constructor(private tui: TUI) {
    this.loader = new Loader(tui, dim, dim);
  }

  start(id: string, name: string, summary: string, skill?: string): void {
    if (skill !== undefined) this.skills.add(skill);
    this.current = summary ? `${name} ${summary}` : name;
    this.tools.set(id, { label: this.current });
    this.tui.requestRender();
  }

  end(id: string, ok: boolean, detail?: string): void {
    const tool = this.tools.get(id);
    if (!tool || tool.ok !== undefined) return;
    tool.ok = ok;
    if (detail !== undefined) tool.detail = detail;
    this.tui.requestRender();
  }

  requestApproval(question: string, command: string): (answer: boolean) => void {
    const approval: Approval = { question, command };
    this.approvals.push(approval);
    this.tui.requestRender();
    return (answer) => {
      approval.answer = answer;
      this.tui.requestRender();
    };
  }

  finish(aborted = false): void {
    if (this.ended) return;
    this.ended = true;
    this.aborted = aborted;
    this.elapsed = Date.now() - this.started;
    this.loader.stop();
    this.tui.requestRender();
  }

  toggle(): void {
    this.expanded = !this.expanded;
    this.tui.requestRender();
  }

  invalidate(): void {
    this.loader.invalidate();
  }

  render(width: number): string[] {
    const tools = [...this.tools.values()];
    const completed = tools.filter((tool) => tool.ok !== undefined).length;
    const failed = tools.filter((tool) => tool.ok === false).length;
    let heading: string[];
    if (!this.ended) {
      const running = this.approvals.some((approval) => approval.answer === undefined)
        ? "等待审批" : tools.find((tool) => tool.ok === undefined)?.label ?? this.current;
      const message = truncateToWidth(`${running} · 已完成 ${completed} 项`, Math.max(0, width - visibleWidth(" ⠋  ")));
      if (message !== this.loaderMessage) {
        this.loaderMessage = message;
        this.loader.setMessage(message);
      }
      heading = this.loader.render(width).slice(1);
    } else {
      const title = this.aborted ? `■ 已中止 · 已完成 ${completed} 项`
        : failed > 0 ? `✗ ${tools.length} 次工具调用，其中 ${failed} 次失败`
        : `✓ ${tools.length} 次工具调用`;
      const skills = this.skills.size > 0 ? ` · skill: ${[...this.skills].join(", ")}` : "";
      heading = [dim(truncateToWidth(`${title}${skills} · ${(this.elapsed / 1000).toFixed(1)}s · Ctrl+O ${this.expanded ? "收起" : "展开"}`, width))];
    }
    for (const approval of this.approvals) {
      if (approval.answer === undefined) {
        heading.push(...new Text(yellow(`  ${approval.question.trim()} [y/N]`), 0, 0).render(width));
      } else {
        const command = approval.command.replace(/\s+/g, " ");
        heading.push(dim(truncateToWidth(`  ↳ 你${approval.answer ? "允许" : "拒绝"}了：${command}`, width)));
      }
    }
    for (const tool of tools.filter((item) => this.expanded || item.ok === false)) {
      const marker = tool.ok === undefined ? "⋯" : tool.ok ? "✓" : "✗";
      heading.push(...new Text(`  ${marker} ${tool.label}`, 0, 0).render(width));
      if (tool.detail) {
        const lines = tool.detail.split(/\r?\n/);
        if (lines.at(-1) === "") lines.pop();
        const omitted = lines.length - 9;
        const shown = omitted > 0 ? [lines[0], `… 省略 ${omitted} 行`, ...lines.slice(-8)] : lines;
        heading.push(...new Text(dim(shown.map((line) => `    ${line}`).join("\n")), 0, 0).render(width));
      }
    }
    return ["", ...heading];
  }
}
