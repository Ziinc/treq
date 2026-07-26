import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
	id: string;
	title: string;
	description?: string;
	type: ToastType;
	action?: {
		label: string;
		onClick: () => void;
	};
}

const ToastContext = React.createContext<{
	toasts: Toast[];
	addToast: (toast: Omit<Toast, "id">) => void;
	removeToast: (id: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = React.useState<Toast[]>([]);

	const addToast = React.useCallback((toast: Omit<Toast, "id">) => {
		const id = Math.random().toString(36).substring(7);
		setToasts((prev) => [...prev, { ...toast, id }]);

		// Auto-remove after 5 seconds
		const removeById = (prev: Toast[]) =>
			prev.filter((toast) => toast.id !== id);
		setTimeout(() => {
			setToasts(removeById);
		}, 5000);
	}, []);

	const removeToast = React.useCallback((id: string) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	}, []);

	return (
		<ToastContext.Provider value={{ addToast, removeToast, toasts }}>
			{children}
			<div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
				{toasts.map((toast) => (
					<ToastItem
						key={toast.id}
						toast={toast}
						onClose={() => removeToast(toast.id)}
					/>
				))}
			</div>
		</ToastContext.Provider>
	);
}

const toastIcons: Record<ToastType, typeof CheckCircle2> = {
	error: XCircle,
	info: Info,
	success: CheckCircle2,
	warning: AlertTriangle,
};

const toastIconStyles: Record<ToastType, string> = {
	error: "text-destructive",
	info: "text-primary",
	success: "text-green-600 dark:text-green-500",
	warning: "text-orange-500 dark:text-orange-400",
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
	const Icon = toastIcons[toast.type];

	return (
		<div
			role="status"
			className="pointer-events-auto flex w-full min-w-[320px] max-w-sm items-start gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg animate-in slide-in-from-left"
		>
			<Icon
				className={cn("mt-0.5 h-5 w-5 shrink-0", toastIconStyles[toast.type])}
			/>
			<div className="flex-1 space-y-1">
				<div className="text-sm font-semibold leading-none">
					{toast.title}
				</div>
				{toast.description && (
					<div className="text-sm text-muted-foreground">
						{toast.description}
					</div>
				)}
				{toast.action && (
					<button
						type="button"
						onClick={() => {
							toast.action?.onClick();
							onClose();
						}}
						className="mt-1 text-sm font-medium text-primary underline underline-offset-2 hover:no-underline"
					>
						{toast.action.label}
					</button>
				)}
			</div>
			<button
				onClick={onClose}
				className="shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
			>
				<X className="h-4 w-4" />
			</button>
		</div>
	);
}

export function useToast() {
	const context = React.useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within ToastProvider");
	}
	return context;
}
