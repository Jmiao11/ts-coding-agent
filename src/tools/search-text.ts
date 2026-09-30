import {
  readdir,
  readFile,
  stat,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import Type from "typebox";

import type {
  AgentTool,
} from "../agent/types.js";

import {
  assertNotSecretFile,
  isSecretFile,
  resolveWorkspacePath,
} from "./workspace-path.js";


const IGNORED_DIRECTORIES =
  new Set([".git", "node_modules", "dist"]);

const MAX_MATCHES = 100;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_LINE_LENGTH = 200;


const searchTextParameters =
  Type.Object(
    {
      pattern: Type.String({
        minLength: 1,
        description:
          "Text to search for. Plain text by default; set regex to true to use a JavaScript regular expression.",
      }),

      path: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "File or directory relative to the workspace root. Defaults to the whole workspace.",
        }),
      ),

      regex: Type.Optional(
        Type.Boolean({
          description:
            "Treat pattern as a JavaScript regular expression.",
        }),
      ),

      ignoreCase: Type.Optional(
        Type.Boolean({
          description:
            "Case-insensitive search.",
        }),
      ),
    },
    {
      additionalProperties: false,
    },
  );


export type SearchMatch = {
  path: string;
  line: number;
  text: string;
};


export type SearchTextDetails = {
  matches: SearchMatch[];
  filesSearched: number;
  truncated: boolean;
};


type WorkspaceFile = {
  absolutePath: string;
  relativePath: string;
};


function escapeRegExp(
  text: string,
): string {
  // 这里是故意用 $&：把每个特殊字符替换成"\ + 它自己"
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


// async function* 合起来叫异步生成器：它既能 await，又能逐个返回结果。
async function* walkFiles(
  absoluteDirectory: string,
  relativeDirectory: string,
): AsyncGenerator<WorkspaceFile> {
  const entries = await readdir(
    absoluteDirectory,
    {
      withFileTypes: true,
    },
  );

  // 固定顺序，结果可复现
  entries.sort(
    (left, right) => left.name.localeCompare(right.name),
  );

  for (const entry of entries) {
    const absolutePath =
      join(absoluteDirectory, entry.name);

    const relativePath =
      relativeDirectory === "."
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;

    /*
     * 符号链接既不是 isDirectory() 也不是 isFile()：
     * 直接跳过，不跟进，避免遍历到 workspace 外。
     */
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        yield* walkFiles(absolutePath, relativePath);
      }
    } else if (entry.isFile()) {
      if (isSecretFile(entry.name)) {
        continue;
      }

      yield {
        absolutePath,
        relativePath,
      };
    }
  }
}


export function createSearchTextTool(
  workspaceRoot: string,
): AgentTool<
  typeof searchTextParameters,
  SearchTextDetails
> {
  return {
    name: "search_text",

    label: "Search Text",

    description:
      "Search file contents in the workspace and return matching lines as path:line: text. Use this to find where something is defined or used when you do not know which file it is in. Skips .git, node_modules, dist and binary files.",

    parameters:
      searchTextParameters,


    async execute(
      _toolCallId,
      parameters,
      signal,
    ) {
      const {
        absolutePath,
        relativePath,
      } = resolveWorkspacePath(
        workspaceRoot,
        parameters.path ?? ".",
      );

      assertNotSecretFile(relativePath);

      let matcher: RegExp;

      try {
        matcher = new RegExp(
          parameters.regex
            ? parameters.pattern
            : escapeRegExp(parameters.pattern),
          parameters.ignoreCase ? "i" : "",
        );
      } catch {
        throw new Error(
          `Invalid regular expression: ${parameters.pattern}`,
        );
      }

      const target =
        await stat(absolutePath);

      const files:
        | WorkspaceFile[]
        | AsyncGenerator<WorkspaceFile> =
        target.isFile()
          ? [{ absolutePath, relativePath }]
          : walkFiles(absolutePath, relativePath);

      const matches: SearchMatch[] = [];
      let filesSearched = 0;
      let truncated = false;

      search:
      for await (const file of files) {
        signal?.throwIfAborted();

        const info =
          await stat(file.absolutePath);

        if (info.size > MAX_FILE_BYTES) {
          continue;
        }

        const buffer =
          await readFile(file.absolutePath);

        // 含 NUL 字节：按二进制文件跳过
        if (buffer.includes(0)) {
          continue;
        }

        filesSearched += 1;

        const lines =
          buffer.toString("utf8").split(/\r?\n/);

        for (const [index, line] of lines.entries()) {
          if (!matcher.test(line)) {
            continue;
          }

          if (matches.length >= MAX_MATCHES) {
            truncated = true;
            break search;
          }

          matches.push({
            path: file.relativePath,
            line: index + 1,
            text:
              line.length > MAX_LINE_LENGTH
                ? `${line.slice(0, MAX_LINE_LENGTH)}…`
                : line,
          });
        }
      }

      const outputLines = matches.map(
        (match) =>
          `${match.path}:${match.line}: ${match.text}`,
      );

      if (truncated) {
        outputLines.push(
          `[results truncated: showing the first ${MAX_MATCHES} matches; narrow the pattern or path]`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text:
              matches.length === 0
                ? `No matches for "${parameters.pattern}" (${filesSearched} files searched).`
                : outputLines.join("\n"),
          },
        ],

        details: {
          matches,
          filesSearched,
          truncated,
        },
      };
    },
  };
}