import * as React from "react";
import { createPortal } from "react-dom";

type PopoverContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
};

const PopoverContext = React.createContext<PopoverContextValue>({
  open: false,
  setOpen: () => {},
  triggerRef: { current: null },
});

const DEFAULT_CONTENT_CLASS =
  "z-50 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none";

export const Popover: React.FC<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}> = ({ open: controlledOpen, onOpenChange, children }) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        {children}
      </div>
    </PopoverContext.Provider>
  );
};

export const PopoverTrigger: React.FC<{
  asChild?: boolean;
  children: React.ReactElement;
}> = ({ children }) => {
  const { open, setOpen, triggerRef } = React.useContext(PopoverContext);
  return React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const { ref } = children as React.ReactElement & {
        ref?: React.Ref<HTMLElement>;
      };
      if (typeof ref === "function") ref(node);
      else if (ref && typeof ref === "object") {
        (ref as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      setOpen(!open);
    },
    "data-state": open ? "open" : "closed",
  });
};

function inTreeSideStyles(
  side: "top" | "right" | "bottom" | "left",
  align: string,
  sideOffset: number,
): React.CSSProperties {
  const alignStyles: React.CSSProperties =
    align === "start"
      ? { left: 0 }
      : align === "end"
        ? { right: 0 }
        : { left: "50%", transform: "translateX(-50%)" };

  if (side === "top") {
    return { bottom: "100%", marginBottom: sideOffset, ...alignStyles };
  }
  if (side === "left") {
    return { right: "100%", marginRight: sideOffset, top: 0 };
  }
  if (side === "right") {
    return { left: "100%", marginLeft: sideOffset, top: 0 };
  }
  return { top: "100%", marginTop: sideOffset, ...alignStyles };
}

export const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    align?: string;
    side?: "top" | "right" | "bottom" | "left";
    sideOffset?: number;
    avoidCollisions?: boolean;
  }
>(
  (
    {
      className,
      align = "center",
      side = "bottom",
      sideOffset = 4,
      avoidCollisions: _avoidCollisions,
      style,
      ...props
    },
    ref,
  ) => {
    const { open, triggerRef } = React.useContext(PopoverContext);
    const [portalStyle, setPortalStyle] =
      React.useState<React.CSSProperties | null>(null);

    React.useLayoutEffect(() => {
      if (!open) {
        setPortalStyle(null);
        return;
      }
      const el = triggerRef.current;
      if (!el) {
        setPortalStyle(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      // jsdom returns zeros — fall back to in-tree absolute positioning.
      if (rect.width === 0 && rect.height === 0) {
        setPortalStyle(null);
        return;
      }

      let top = rect.bottom + sideOffset;
      let left = rect.left;
      let transform = "";

      if (side === "top") {
        top = rect.top - sideOffset;
        transform = "translateY(-100%)";
      } else if (side === "left") {
        top = rect.top;
        left = rect.left - sideOffset;
        transform = "translateX(-100%)";
      } else if (side === "right") {
        top = rect.top;
        left = rect.right + sideOffset;
      }

      if (side === "top" || side === "bottom") {
        if (align === "end") {
          left = rect.right;
          transform = `${transform} translateX(-100%)`.trim();
        } else if (align === "center") {
          left = rect.left + rect.width / 2;
          transform = `${transform} translateX(-50%)`.trim();
        }
      }

      setPortalStyle({
        position: "fixed",
        zIndex: 50,
        top,
        left,
        transform: transform || undefined,
      });
    }, [open, align, side, sideOffset, triggerRef]);

    if (!open) return null;

    const content = (
      <div
        ref={ref}
        data-state="open"
        data-side={side}
        className={[DEFAULT_CONTENT_CLASS, className].filter(Boolean).join(" ")}
        style={{
          ...(portalStyle ?? {
            position: "absolute",
            zIndex: 50,
            ...inTreeSideStyles(side, align, sideOffset),
          }),
          ...style,
        }}
        {...props}
      />
    );

    return portalStyle ? createPortal(content, document.body) : content;
  },
);
