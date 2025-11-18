export interface PlanSection {
  id: string;
  type: 'plan' | 'implementation_plan' | 'tasks' | 'suggestions';
  title: string;
  steps: string[];
  rawText: string;
  rawMarkdown: string;
  scope?: string;
  isEdited?: boolean;
  editedContent?: string;
  editedAt?: Date;
  timestamp: Date;
}

