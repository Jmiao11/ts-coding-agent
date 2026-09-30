import {
  mkdtemp,
  rm,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  tmpdir,
} from "node:os";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createRunCommandTool,
  decodeOutput,
  truncateTail,
} from "../src/tools/run-command.js";


let tempDirectory:
  string | undefined;


afterEach(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, {
      recursive: true,
      force: true,
      // 被 kill 的进程可能还没完全释放目录
      maxRetries: 3,
    });

    tempDirectory = undefined;
  }
});


async function createWorkspace(): Promise<string> {
  tempDirectory = await mkdtemp(
    join(tmpdir(), "agent-harness-"),
  );

  return tempDirectory;
}


describe("truncateTail", () => {
  it("keeps the end of long output", () => {
    const text = Array.from(
      { length: 500 },
      (_, index) => `line ${index}`,
    ).join("\n");

    const result = truncateTail(text, 200, 100_000);

    expect(result.truncated).toBe(true);
    expect(result.text.split("\n")).toHaveLength(200);
    expect(result.text.startsWith("line 300")).toBe(true);
    expect(result.text.endsWith("line 499")).toBe(true);
  });
});


describe("run_command", () => {
  it("returns stdout + stderr and exit code without leaking AGENT_* env", async () => {
    const root = await createWorkspace();

    const previous = process.env.AGENT_API_KEY;
    process.env.AGENT_API_KEY = "secret-value";

    try {
      const tool = createRunCommandTool(root);

      const result = await tool.execute("call-1", {
        command:
          `node -e "console.log(process.env.AGENT_API_KEY ?? 'no-key'); console.error('to-stderr'); process.exit(3)"`,
      });

      const text = result.content[0]?.text ?? "";

      expect(text).toContain("no-key");
      expect(text).toContain("to-stderr");
      expect(text).toContain("Exit code: 3");
      expect(text).not.toContain("secret-value");

      expect(result.details.exitCode).toBe(3);
      expect(result.isError).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_API_KEY;
      } else {
        process.env.AGENT_API_KEY = previous;
      }
    }
  });


  it(
    "kills the whole process tree on timeout",
    { timeout: 15_000 },
    async () => {
      const root = await createWorkspace();
      const tool = createRunCommandTool(root);

      // cmd.exe → node：只 kill cmd.exe 的话，这里会一直卡住
      const result = await tool.execute("call-1", {
        command: `node -e "setInterval(function () {}, 1000)"`,
        timeoutSeconds: 1,
      });

      expect(result.details.timedOut).toBe(true);
      expect(result.content[0]?.text).toContain("timed out");
    },
  );
});


describe("decodeOutput", () => {
  it.runIf(process.platform === "win32")(
    "decodes UTF-8 and GBK lines in the same output",
    () => {
      // "找不到文件" 的 GBK 编码：就是之前乱码 "�Ҳ����ļ�" 的原始字节
      const gbk = Buffer.from([
        0xd5, 0xd2, 0xb2, 0xbb, 0xb5, 0xbd, 0xce, 0xc4, 0xbc, 0xfe,
      ]);

      const output = Buffer.concat([
        Buffer.from("✓ F:/学习资料\r\n", "utf8"),
        gbk,
        Buffer.from("\r\n"),
      ]);

      expect(decodeOutput(output)).toBe(
        "✓ F:/学习资料\r\n找不到文件\r\n",
      );
    },
  );
});
