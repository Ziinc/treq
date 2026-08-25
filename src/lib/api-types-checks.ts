export interface WorkflowStepInfo {
  name: string;
}
export interface WorkflowJobInfo {
  id: string;
  name: string;
  steps: WorkflowStepInfo[];
}
export interface WorkflowInfo {
  filename: string;
  name: string;
  jobs: WorkflowJobInfo[];
}
export interface StepResult {
  name: string;
  success: boolean;
}
export interface JobResult {
  job_id: string;
  steps: StepResult[];
  success: boolean;
}

export interface RunJobSummary {
  job_id: string;
  status: string;
  steps: StepResult[];
  has_logs: boolean;
}
export interface RunSummary {
  id: number;
  filename: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  jobs: RunJobSummary[];
}
export interface LogRecordView {
  timestamp: string;
  severity_number: number;
  severity_text: string;
  body: string;
  trace_id: string;
  span_id: string;
  run_id: number;
  job_id: string;
  step_index: number;
  step_name: string;
  stream: string;
}

export interface LogBucket {
  bucket: string;
  severity_text: string;
  count: number;
}
export interface SqlResult {
  columns: string[];
  rows: (string | null)[][];
  row_count: number;
}
