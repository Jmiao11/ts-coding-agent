import type {
  RunResult,
  RunStatus,
} from "../src/core/run-status.js";


const succeeded: RunStatus = "SUCCEEDED";

const failed: RunStatus = "FAILED";

const needsHuman: RunStatus = "NEEDS_HUMAN";

const cancelled: RunStatus = "CANCELLED";


// @ts-expect-error RECOVERED 不是最终 RunStatus
const recovered: RunStatus = "RECOVERED";


// @ts-expect-error EXECUTION_ERROR 属于 ActionResult<ExampleOutcome>，不属于 RunStatus
const executionError: RunStatus = "EXECUTION_ERROR";


const result: RunResult = {
  runId: "run-001",
  status: "SUCCEEDED",
};


void [
  succeeded,
  failed,
  needsHuman,
  cancelled,
  recovered,
  executionError,
  result,
];