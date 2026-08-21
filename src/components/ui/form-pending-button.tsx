import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

export function FormPendingButton({
  pendingLabel,
  children,
  disabled,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={disabled || pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
