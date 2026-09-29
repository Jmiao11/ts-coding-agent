import type { ActionResult } from "../src/core/action-result.js";


// 测试用 outcome
type ExampleOutcome = {
  verdict: "PASS" | "FAIL";
};

// ====================
// 合法状态
// ====================

const completed: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-001",
  invocationId: "invocation-001",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "PROCESS_COMPLETED",

  status: "COMPLETED",

  outcome: {
    verdict: "FAIL",
  },
};


const executionError: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-002",
  invocationId: "invocation-002",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "SPAWN_FAILED",

  status: "EXECUTION_ERROR",

  executionError: {
    code: "ENOENT",
    phase: "spawn",
  },
};


const cancelled: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-003",
  invocationId: "invocation-003",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "USER_CANCELLED",

  status: "CANCELLED",

  cancellation: {
    requestId: "request-001",
    caller: "user",
  },
};


const inconclusive: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-004",
  invocationId: "invocation-004",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "MISSING_EVIDENCE",

  status: "INCONCLUSIVE",

  missingEvidence: [
    "JUnit report missing",
  ],
};


// ====================
// 非法状态
// ====================

const invalidCompleted: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-005",
  invocationId: "invocation-005",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "INVALID",

  status: "COMPLETED",
  outcome: { verdict: "PASS" },

  // @ts-expect-error COMPLETED 不能携带 executionError
  executionError: {
    code: "ENOENT",
    phase: "spawn",
  },
};


const invalidExecutionError: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-006",
  invocationId: "invocation-006",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "INVALID",

  status: "EXECUTION_ERROR",

  executionError: {
    code: "TIMEOUT",
    phase: "execution",
  },

  // @ts-expect-error EXECUTION_ERROR 不能携带 outcome
  outcome: "PASS",
};


const invalidInconclusive: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-007",
  invocationId: "invocation-007",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "INVALID",

  status: "INCONCLUSIVE",

  // @ts-expect-error INCONCLUSIVE 至少需要一条 missing evidence
  // 我要求下一行必须产生 TypeScript 错误。
  missingEvidence: [],
};


// @ts-expect-error CANCELLED 必须携带 cancellation provenance
const invalidCancelled: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-008",
  invocationId: "invocation-008",
  actionType: "run_tests",

  classificationVersion: 1,

  reasonCode: "INVALID",

  status: "CANCELLED",
};


const reclassified: ActionResult<ExampleOutcome> = {
  logicalActionId: "action-001",
  invocationId: "invocation-001",
  actionType: "run_tests",

  classificationVersion: 2,
  supersedes: 1,

  reasonCode: "EVIDENCE_RESOLVED",

  status: "COMPLETED",

  outcome: {
    verdict: "FAIL",
  },
};


// 防止 isolatedModules 下文件没有实际使用
void [
  completed,
  executionError,
  cancelled,
  inconclusive,
  invalidCompleted,
  invalidExecutionError,
  invalidInconclusive,
  invalidCancelled,
];


function describeResult<TOutcome>(
  result: ActionResult<TOutcome>,
): string {
  switch (result.status) {
    case "COMPLETED":
      return `completed: ${result.outcome}`;

    case "EXECUTION_ERROR":
      return `execution error: ${result.executionError.code}`;

    case "CANCELLED":
      return `cancelled by: ${result.cancellation.caller}`;

    case "INCONCLUSIVE":
      return `missing: ${result.missingEvidence.join(", ")}`;
  }
}
