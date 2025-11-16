export type PlanHistoryStatus = 'executed';

export interface PlanHistoryEntry {
  id: number;
  worktree_id: number;
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
