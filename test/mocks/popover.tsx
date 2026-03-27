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
    sideOffset?: number;
  }
>(({ className, align: _a, sideOffset: _s, ...props }, ref) => {
  const { open } = React.useContext(PopoverContext);
  if (!open) return null;
  return <div ref={ref} data-state="open" className={className} {...props} />;
});
