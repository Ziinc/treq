export type PlanHistoryStatus = 'executed';

export interface PlanHistoryEntry {
  id: number;
  workspace_id: number;
  title: string;
  type: string;
  content: any;
  created_at: string;
  executed_at: string;
  status: PlanHistoryStatus;
}

export interface PlanHistoryPayload {
  title: string;
  type: string;
  content: any;
  created_at?: string;
  executed_at?: string;
  status?: PlanHistoryStatus;
}
