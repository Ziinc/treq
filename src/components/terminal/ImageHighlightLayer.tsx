import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import {
  type ImageHighlightComment,
  type NormalizedRect,
  rectFromDrag,
} from "../../lib/sendAssetReview";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

interface ImageHighlightLayerProps {
  highlights: ImageHighlightComment[];
  activeId: string | null;
  onActiveIdChange: (id: string | null) => void;
  onHighlightsChange: (highlights: ImageHighlightComment[]) => void;
  onClickWithoutDrag?: () => void;
  children: React.ReactNode;
}

export function ImageHighlightLayer({
  highlights,
  activeId,
  onActiveIdChange,
  onHighlightsChange,
  onClickWithoutDrag,
  children,
}: ImageHighlightLayerProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [draft, setDraft] = useState<NormalizedRect | null>(null);

  const localPoint = (event: ReactPointerEvent) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const point = localPoint(event);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
    };
    setDraft(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = localPoint(event);
    setDraft(
      rectFromDrag(
        { x: drag.startX, y: drag.startY },
        { x: point.x, y: point.y },
        { width: point.width, height: point.height },
      ),
    );
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const point = localPoint(event);
    const rect = rectFromDrag(
      { x: drag.startX, y: drag.startY },
      { x: point.x, y: point.y },
      { width: point.width, height: point.height },
    );
    setDraft(null);
    if (!rect) {
      onClickWithoutDrag?.();
      return;
    }
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `hl-${Date.now()}`;
    const next: ImageHighlightComment = { id, rect, comment: "" };
    onHighlightsChange([...highlights, next]);
    onActiveIdChange(id);
  };

  return (
    <div className="relative inline-block max-w-full">
      {children}
      <div
        ref={surfaceRef}
        data-testid="treq-send-highlight-surface"
        className="absolute inset-0 z-10 cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {draft && (
        <HighlightBox rect={draft} className="border-red-500/70" />
      )}
      {highlights.map((highlight) => (
        <HighlightBox
          key={highlight.id}
          rect={highlight.rect}
          testId={`treq-send-highlight-${highlight.id}`}
          className="border-red-500"
          onMouseDown={(event) => {
            event.stopPropagation();
            onActiveIdChange(highlight.id);
          }}
        >
          {activeId === highlight.id && (
            <div
              data-testid={`treq-send-highlight-comment-${highlight.id}`}
              className="absolute left-full top-0 z-20 ml-2 w-56 rounded-md border border-white/20 bg-zinc-950 p-2 shadow-xl"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Textarea
                value={highlight.comment}
                onChange={(event) =>
                  onHighlightsChange(
                    highlights.map((item) =>
                      item.id === highlight.id
                        ? { ...item, comment: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Comment on this area"
                aria-label="Highlight comment"
                className="min-h-[72px] border-white/15 bg-transparent text-sm text-zinc-100"
              />
              <div className="mt-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-zinc-300 hover:text-white"
                  aria-label="Remove highlight"
                  onClick={() => {
                    onHighlightsChange(
                      highlights.filter((item) => item.id !== highlight.id),
                    );
                    onActiveIdChange(null);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </HighlightBox>
      ))}
    </div>
  );
}

function HighlightBox({
  rect,
  className,
  testId,
  children,
  onMouseDown,
}: {
  rect: NormalizedRect;
  className?: string;
  testId?: string;
  children?: React.ReactNode;
  onMouseDown?: (event: React.MouseEvent) => void;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "pointer-events-auto absolute z-10 box-border border-2",
        className,
      )}
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`,
        height: `${rect.height * 100}%`,
      }}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
}
