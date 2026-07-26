import * as React from "react";
import { X } from "lucide-react";
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

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
	const typeStyles = {
		error:
			"bg-destructive dark:bg-destructive/90 border border-destructive/30 text-destructive-foreground",
		info: "bg-primary dark:bg-primary/90 border border-primary/30 text-primary-foreground",
		success:
			"bg-green-600 dark:bg-green-700 border border-green-500/30 dark:border-green-600/30 text-white",
		warning:
			"bg-orange-600 dark:bg-orange-700 border border-orange-500/30 dark:border-orange-600/30 text-white",
	};

	return (
		<div
			className={cn(
				"min-w-[300px] rounded-xl py-2.5 px-4 shadow-lg animate-in slide-in-from-left",
				typeStyles[toast.type],
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="flex-1">
					<div className="text-base font-medium">{toast.title}</div>
					{toast.description && (
						<div className="text-base opacity-90 mt-0.5">
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
							className="mt-2 text-base font-medium underline underline-offset-2 opacity-95 hover:opacity-100"
						>
							{toast.action.label}
						</button>
					)}
				</div>
				<button
					onClick={onClose}
					className="text-current/70 hover:text-current hover:bg-white/20 dark:hover:bg-white/10 rounded transition-colors p-0.5"
				>
					<X className="w-4 h-4" />
				</button>
			</div>
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
