import { Copy, MessageSquare } from "lucide-react";

interface ContextMenuProps {
  position: { x: number; y: number };
  onAddComment: () => void;
  onCopyLocation: () => void;
  onCopyLines: () => void;
}

export function ContextMenu({
  position,
  onAddComment,
  onCopyLocation,
  onCopyLines,
}: ContextMenuProps) {
  return (
    <div
      className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[180px]"
      style={{ left: position.x, top: position.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2"
        onClick={onAddComment}
      >
        <MessageSquare className="w-4 h-4" />
        Add comment
      </button>
      <button
        className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2"
        onClick={onCopyLocation}
        data-testid="copy-line-location"
      >
        <Copy className="w-4 h-4" />
        Copy line location
      </button>
      <button
        className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2"
        onClick={onCopyLines}
        data-testid="copy-lines"
      >
        <Copy className="w-4 h-4" />
        Copy lines
      </button>
    </div>
  );
}
