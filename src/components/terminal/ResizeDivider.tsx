import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

interface ResizeDividerProps {
  onResize: (deltaX: number) => void;
}

export const ResizeDivider = memo<ResizeDividerProps>(function ResizeDivider({
  onResize,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const lastXRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    lastXRef.current = e.clientX;
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      onResize(deltaX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, onResize]);

  // Set cursor during drag
  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  }, [isDragging]);

  return (
    <div
      className="relative flex-shrink-0 w-1 group cursor-ew-resize"
      onMouseDown={handleMouseDown}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1 bg-border transition-colors",
          "group-hover:bg-primary/50",
          isDragging && "bg-primary"
        )}
      />
      <div className="absolute inset-y-0 -left-1 w-3 cursor-ew-resize" />
    </div>
  );
});
