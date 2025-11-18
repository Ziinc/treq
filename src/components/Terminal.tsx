import { ConsolidatedTerminal } from "./ConsolidatedTerminal";

interface TerminalProps {
  sessionId: string;
  workingDir?: string;
  shell?: string;
}

export const Terminal: React.FC<TerminalProps> = ({ sessionId, workingDir, shell }) => {
  return (
    <ConsolidatedTerminal
      sessionId={sessionId}
      workingDirectory={workingDir}
      shell={shell}
      persistSession={false}
      containerClassName="h-full w-full"
    />
  );
};
