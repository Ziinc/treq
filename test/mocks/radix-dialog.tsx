import * as React from "react";

const Root: React.FC<{
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: React.ReactNode;
}> = ({ children }) => <>{children}</>;
const Trigger = React.forwardRef<
	HTMLButtonElement,
	React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ children, ...props }, ref) => (
	<button ref={ref} {...props}>
		{children}
	</button>
));
const Portal: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
	<>{children}</>
);
const Overlay = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>((props, ref) => <div ref={ref} {...props} />);
const Content = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => (
	<div ref={ref} {...props}>
		{children}
	</div>
));
const Title = React.forwardRef<
	HTMLHeadingElement,
	React.HTMLAttributes<HTMLHeadingElement>
>(({ children, ...props }, ref) => (
	<h2 ref={ref} {...props}>
		{children}
	</h2>
));
const Description = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLParagraphElement>
>(({ children, ...props }, ref) => (
	<p ref={ref} {...props}>
		{children}
	</p>
));
const Close = React.forwardRef<
	HTMLButtonElement,
	React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ children, ...props }, ref) => (
	<button ref={ref} {...props}>
		{children}
	</button>
));

export { Root, Trigger, Portal, Overlay, Content, Title, Description, Close };
