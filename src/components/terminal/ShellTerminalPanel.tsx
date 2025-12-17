import React, { memo } from "react";
import { X, Terminal } from "lucide-react";
import { ConsolidatedTerminal } from "../ConsolidatedTerminal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";
import {
  MIN_TERMINAL_WIDTH,
  type ShellTerminalData,
  type TerminalRefsMap,
} from "./types";

interface ShellTerminalPanelProps {
  terminalData: ShellTerminalData;
  collapsed: boolean;
  onClose?: () => void;
  canClose: boolean;
  onSessionError?: (message: string) => void;
  terminalRefs: React.MutableRefObject<TerminalRefsMap>;
  width?: number | null;
}

export const ShellTerminalPanel = memo<ShellTerminalPanelProps>(
  function ShellTerminalPanel({
    terminalData,
    collapsed,
    onClose,
    canClose,
    onSessionError,
    terminalRefs,
    width,
  }) {
    const isHidden = collapsed;

    return (
      <div
        data-terminal-id={terminalData.id}
        className={cn(
          "flex flex-col min-h-0 overflow-hidden flex-shrink-0",
          width == null && "flex-1"
        )}
        style={{
          minWidth: MIN_TERMINAL_WIDTH,
          width: width != null ? width : undefined,
        }}
      >
        {/* Header */}
        <div className="h-7 min-h-[28px] flex items-center justify-between px-2 bg-background border-b border-r border-border flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground min-w-0">
            <Terminal className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">Shell</span>
          </div>
          {canClose && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-4 w-4 rounded-sm hover:bg-muted flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                    aria-label="Close shell"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Terminal */}
        <div className="flex-1 min-h-0 overflow-hidden border-r border-border" style={{ backgroundColor: "#1e1e1e" }}>
          <ConsolidatedTerminal
            ref={(el) => {
              if (el) {
                terminalRefs.current.set(terminalData.id, el);
              } else {
                terminalRefs.current.delete(terminalData.id);
              }
            }}
            sessionId={terminalData.id}
            workingDirectory={terminalData.workingDirectory}
            onSessionError={onSessionError}
            containerClassName="h-full w-full overflow-hidden"
            terminalPaneClassName="w-full h-full"
            isHidden={isHidden}
          />
        </div>
      </div>
    );
  }
);
