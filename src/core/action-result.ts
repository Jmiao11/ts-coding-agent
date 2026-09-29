export type ExecutionStatus =
  | "COMPLETED"
  | "EXECUTION_ERROR"
  | "CANCELLED"
  | "INCONCLUSIVE";


type ActionResultBase = {
  logicalActionId: string;
  invocationId: string;
  actionType: string;

  classificationVersion: number;
  supersedes?: number;

  reasonCode: string;
};
// logicalActionId
// → 这是哪个逻辑动作
//
// invocationId
// → 这是该动作的哪一次具体执行
//
// actionType
// → 执行的是什么动作
//
// reasonCode
// → 为什么得到当前结果


export type CompletedResult<TOutcome> = ActionResultBase & {
  status: "COMPLETED";

  outcome: TOutcome;
};


export type ExecutionErrorResult = ActionResultBase & {
  status: "EXECUTION_ERROR";

  executionError: {
    code: string;
    phase: string;
  };
};


export type CancelledResult = ActionResultBase & {
  status: "CANCELLED";

  cancellation: {
    requestId: string;
    caller: string;
  };
};

// Runtime 没有足够证据可靠地判断结果
// {
//   logicalActionId: "run-tests-1",
//   invocationId: "invoke-1",
//   actionType: "RUN_TESTS",
//   reasonCode: "MISSING_JUNIT_REPORT",
//
//   status: "INCONCLUSIVE",
//
//   missingEvidence: [
//     "JUnit report"
//   ]
// }
export type InconclusiveResult = ActionResultBase & {
  status: "INCONCLUSIVE";

  missingEvidence: [string, ...string[]];
};
// [string, ...string[]]至少必须有一个字符串


export type ActionResult<TOutcome> =
  | CompletedResult<TOutcome>
  | ExecutionErrorResult
  | CancelledResult
  | InconclusiveResult;
