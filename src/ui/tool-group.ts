import { Loader, Text, truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";

const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;

type Tool = { label: string; ok?: boolean; detail?: string };

/** 一步中的工具共用一个 Loader；结束后只保留摘要和失败详情。 */
export class ToolActivityGroup implements Component {
  private tools = new Map<string, Tool>();
  private loader: Loader;
  private started = Date.now();
  private elapsed = 0;
  private ended = false;
  private aborted = false;
  private current = "";
  private loaderMessage = "";

  constructor(private tui: TUI) {
    this.loader = new Loader(tui, dim, dim);
  }

  start(id: string, name: string, summary: string): void {
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

  finish(aborted = false): void {
    if (this.ended) return;
    this.ended = true;
    this.aborted = aborted;
    this.elapsed = Date.now() - this.started;
    this.loader.stop();
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
      const running = tools.find((tool) => tool.ok === undefined)?.label ?? this.current;
      const message = truncateToWidth(`${running} · 已完成 ${completed} 项`, Math.max(1, width - 4));
      if (message !== this.loaderMessage) {
        this.loaderMessage = message;
        this.loader.setMessage(message);
      }
      heading = this.loader.render(width).slice(1);
    } else {
      const title = this.aborted ? `■ 已中止 · 已完成 ${completed} 项`
        : failed > 0 ? `✗ ${tools.length} 次工具调用，其中 ${failed} 次失败`
        : `✓ ${tools.length} 次工具调用`;
      heading = new Text(dim(`${title} · ${(this.elapsed / 1000).toFixed(1)}s · Ctrl+O 展开`), 0, 0).render(width);
    }
    for (const tool of tools.filter((item) => item.ok === false)) {
      heading.push(...new Text(`  ✗ ${tool.label}`, 0, 0).render(width));
      if (tool.detail) {
        const lines = tool.detail.split(/\r?\n/);
        if (lines.at(-1) === "") lines.pop();
        const omitted = lines.length - 9;
        const shown = omitted > 0 ? [lines[0], `… 省略 ${omitted} 行`, ...lines.slice(-8)] : lines;
        heading.push(...new Text(dim(shown.map((line) => `    ${line}`).join("\n")), 0, 0).render(width));
      }
    }
    return heading;
  }
}
