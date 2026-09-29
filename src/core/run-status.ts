export type RunStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "NEEDS_HUMAN"
  | "CANCELLED";


export type RunResult = {
  runId: string;
  status: RunStatus;
};