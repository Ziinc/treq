import { Button } from "../ui/button";

interface TerminalErrorOverlayProps {
  error: string;
  isRetrying: boolean;
  onRetry: () => void;
  onClose?: () => void;
}

export const TerminalErrorOverlay = ({
  error,
  isRetrying,
  onRetry,
  onClose,
}: TerminalErrorOverlayProps) => (
  <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex items-center justify-center z-20 p-6">
    <div className="w-full max-w-sm rounded-lg border bg-card p-4 text-center shadow-lg">
      <p className="text-sm font-semibold">Unable to start terminal</p>
      <p className="text-sm text-muted-foreground mt-2 break-words">
        {error}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Button size="sm" onClick={onRetry} disabled={isRetrying}>
          Try again
        </Button>
        {onClose && (
          <Button size="sm" variant="outline" onClick={onClose}>
            Close session
          </Button>
        )}
      </div>
    </div>
  </div>
);
