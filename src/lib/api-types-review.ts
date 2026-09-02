/** Mirrors ConflictComment in changes-diff-viewer/types.ts. */
export interface ConflictCommentRecord {
  id: string;
  conflictId: string;
  filePath: string;
  conflictNumber: number;
  text: string;
  createdAt: string;
}
