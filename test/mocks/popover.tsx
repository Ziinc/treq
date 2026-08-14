import * as React from "react";

const PopoverContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

export const Popover: React.FC<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}> = ({ open: controlledOpen, onOpenChange, children }) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
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
  const { open, setOpen } = React.useContext(PopoverContext);
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      setOpen(!open);
    },
    "data-state": open ? "open" : "closed",
  });
};

export const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    align?: string;
    side?: "top" | "right" | "bottom" | "left";
    sideOffset?: number;
  }
>(
  (
    { className, align = "center", side = "bottom", sideOffset = 4, ...props },
    ref,
  ) => {
    const { open } = React.useContext(PopoverContext);
    if (!open) return null;

    const alignStyles: React.CSSProperties =
      align === "start"
        ? { left: 0 }
        : align === "end"
          ? { right: 0 }
          : { left: "50%", transform: "translateX(-50%)" };

    const sideStyles: React.CSSProperties =
      side === "top"
        ? {
            bottom: "100%",
            marginBottom: sideOffset,
            ...(align === "center"
              ? { left: "50%", transform: "translateX(-50%)" }
              : alignStyles),
          }
        : side === "left"
          ? { right: "100%", marginRight: sideOffset, top: 0 }
          : side === "right"
            ? { left: "100%", marginLeft: sideOffset, top: 0 }
            : {
                top: "100%",
                marginTop: sideOffset,
                ...(align === "center"
                  ? { left: "50%", transform: "translateX(-50%)" }
                  : alignStyles),
              };

    return (
      <div
        ref={ref}
        data-state="open"
        data-side={side}
        className={className}
        style={{ position: "absolute", zIndex: 50, ...sideStyles }}
        {...props}
      />
    );
  },
);
