import { expect, it } from "vitest";

import { formatTokenCount } from "../src/ui/status-text.js";

it.each([
  [0, "0"],
  [999, "999"],
  [1000, "1000"],
  [1001, "1.0k"],
  [15900, "15.9k"],
])("formats %i cumulative tokens as %s", (count, expected) => {
  expect(formatTokenCount(count)).toBe(expected);
});
