/*
 * 修改 ~/.agent-harness.env 里的几项，其他内容（注释、别的变量、换行符）原样保留。
 * 引号的规则按 Node 自己的解析器（process.loadEnvFile / util.parseEnv）来，测试里用它来验证。
 */

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// 一行赋值：可选的 export，再是 KEY=
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;


/**
 * 把值写成 Node 能原样读回来的形式。
 * - 不加引号的话，# 后面会被当成注释截掉（API Key 里可能有 #）；
 * - 双引号里的 \n 会变成换行，Windows 路径 C:\new\... 会被改掉；
 * 所以优先用单引号（里面的内容不做任何转义），值里有单引号再用反引号。
 */
export function formatEnvValue(
  value: string,
): string {
  if (/[\r\n]/.test(value)) {
    throw new Error("值里不能有换行");
  }

  if (!value.includes("'")) {
    return `'${value}'`;
  }

  if (!value.includes("`")) {
    return `\`${value}\``;
  }

  throw new Error("值里同时有单引号和反引号，没法安全地写进 env 文件");
}


/**
 * 返回修改后的文件内容：已有的项就地替换（重复出现的后几行删掉，否则后面的会覆盖前面的），
 * 没有的项追加到末尾。
 */
export function updateEnvFile(
  text: string,
  updates: Record<string, string>,
): string {
  for (const key of Object.keys(updates)) {
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`不合法的变量名：${key}`);
    }
  }

  // 保持文件原来的换行符：Windows 上手写的文件通常是 CRLF
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length === 0 ? [] : text.split(/\r?\n/);

  // split 之后，以换行结尾的文件最后会多一个空字符串
  if (lines.at(-1) === "") {
    lines.pop();
  }

  const written = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const key = ASSIGNMENT.exec(line)?.[1];

    if (key === undefined || !Object.hasOwn(updates, key)) {
      result.push(line);
      continue;
    }

    if (!written.has(key)) {
      result.push(`${key}=${formatEnvValue(updates[key]!)}`);
      written.add(key);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!written.has(key)) {
      result.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  return result.length === 0 ? "" : result.join(eol) + eol;
}