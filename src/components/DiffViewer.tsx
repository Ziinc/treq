import { StagingDiffViewer } from "./StagingDiffViewer";

interface DiffViewerProps {
  worktreePath: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ worktreePath }) => {
  return <StagingDiffViewer worktreePath={worktreePath} />;
};
