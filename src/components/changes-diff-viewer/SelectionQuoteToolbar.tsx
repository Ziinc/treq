import { useEffect, useState } from "react";
import { Quote } from "lucide-react";
import { Button } from "../ui/button";

interface SelectionQuoteToolbarProps {
  containerRef: React.RefObject<HTMLElement>;
  onQuote: (selectedText: string) => void;
}

/**
 * Floating "Quote" button that appears when the user selects text inside
 * `containerRef`. Positioned above the selection, same fixed-positioning
 * technique as `ContextMenu.tsx`.
 */
export function SelectionQuoteToolbar({
  containerRef,
  onQuote,
}: SelectionQuoteToolbarProps) {
  const [toolbar, setToolbar] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const container = containerRef.current;
      if (
        !selection ||
        selection.isCollapsed ||
        selection.rangeCount === 0 ||
        !container ||
        !selection.anchorNode ||
        !selection.focusNode ||
        !container.contains(selection.anchorNode) ||
        !container.contains(selection.focusNode)
      ) {
        setToolbar(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        setToolbar(null);
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setToolbar({ x: rect.left + rect.width / 2, y: rect.top, text });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [containerRef]);

  if (!toolbar) return null;

  return (
    <div
      className="fixed z-50 -translate-x-1/2 -translate-y-full -mt-2"
      style={{ left: toolbar.x, top: toolbar.y }}
    >
      <Button
        size="sm"
        variant="secondary"
        className="gap-1.5 shadow-lg border border-border font-sans"
        // Prevent the browser from collapsing the selection (and thus
        // unmounting this button via selectionchange) before click fires.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onQuote(toolbar.text);
          window.getSelection()?.removeAllRanges();
          setToolbar(null);
        }}
      >
        <Quote className="w-3 h-3" />
        Quote
      </Button>
    </div>
  );
}
