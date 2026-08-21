import * as React from "react";

const Root: React.FC<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}> = ({ children }) => <>{children}</>;
const Trigger = ({
  children,
  ref,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button ref={ref} {...props}>
    {children}
  </button>
);
const Portal: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);
const Overlay = ({ ref, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div ref={ref} {...props} />
);
const Content = ({
  children,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div ref={ref} {...props}>
    {children}
  </div>
);
const Title = ({
  children,
  ref,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 ref={ref} {...props}>
    {children}
  </h2>
);
const Description = ({
  children,
  ref,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p ref={ref} {...props}>
    {children}
  </p>
);
const Close = ({
  children,
  ref,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button ref={ref} {...props}>
    {children}
  </button>
);

export { Root, Trigger, Portal, Overlay, Content, Title, Description, Close };
