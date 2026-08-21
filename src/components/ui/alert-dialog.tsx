import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Button } from "./button";
import { cn } from "../../lib/utils";

interface AlertDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const AlertDialogContext = React.createContext<{
  onOpenChange?: (open: boolean) => void;
}>({});

const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  onOpenChange,
  children,
}) => (
  <AlertDialogContext.Provider value={{ onOpenChange }}>
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog>
  </AlertDialogContext.Provider>
);

const AlertDialogContent = ({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<"div">) => (
  <DialogContent ref={ref} className={className} {...props}>
    {children}
  </DialogContent>
);
AlertDialogContent.displayName = "AlertDialogContent";

const AlertDialogHeader = DialogHeader;
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogTitle = DialogTitle;
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = DialogDescription;
AlertDialogDescription.displayName = "AlertDialogDescription";

const AlertDialogFooter = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4",
      className,
    )}
    {...props}
  />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogCancel = ({
  className,
  children,
  onClick,
  ref,
  ...props
}: React.ComponentProps<"button">) => {
  const { onOpenChange } = React.useContext(AlertDialogContext);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    onOpenChange?.(false);
  };

  return (
    <Button
      ref={ref}
      variant="ghost"
      onClick={handleClick}
      className={className}
      {...props}
    >
      {children}
    </Button>
  );
};
AlertDialogCancel.displayName = "AlertDialogCancel";

const AlertDialogAction = ({
  className,
  children,
  onClick,
  ref,
  ...props
}: React.ComponentProps<"button">) => (
  <Button
    ref={ref}
    variant="default"
    onClick={onClick}
    className={className}
    {...props}
  >
    {children}
  </Button>
);
AlertDialogAction.displayName = "AlertDialogAction";

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
};
