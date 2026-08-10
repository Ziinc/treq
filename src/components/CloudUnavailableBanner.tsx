import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";

interface CloudUnavailableBannerProps {
  onRetry: () => void | Promise<void>;
  retrying?: boolean;
}

/**
 * Non-blocking status for when Treq Cloud (Supabase) cannot be reached.
 * Cloud features are ancillary to the local ADE, so this stays inline.
 */
export const CloudUnavailableBanner: React.FC<CloudUnavailableBannerProps> = ({
  onRetry,
  retrying = false,
}) => (
  <div
    role="status"
    data-testid="cloud-unavailable-banner"
    className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3"
  >
    <p className="text-sm text-muted-foreground">
      Treq Cloud is unavailable. Local workspace features continue to work.
    </p>
    <Button
      size="sm"
      variant="outline"
      className="shrink-0"
      disabled={retrying}
      onClick={() => void onRetry()}
    >
      {retrying ? (
        <>
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          Retrying
        </>
      ) : (
        "Retry"
      )}
    </Button>
  </div>
);
