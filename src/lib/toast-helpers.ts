/**
 * Toast helper utilities for consistent error and success messaging
 */

type ToastType = "success" | "error" | "info" | "warning";

interface ToastFn {
	(toast: { title: string; description: string; type: ToastType }): void;
}

/**
 * Show an error toast with consistent formatting
 * Automatically extracts error message from Error objects
 */
export function showErrorToast(
	addToast: ToastFn,
	title: string,
	error: unknown,
): void {
	addToast({
		description: error instanceof Error ? error.message : String(error),
		title,
		type: "error",
	});
}

/**
 * Show a success toast
 */
export function showSuccessToast(
	addToast: ToastFn,
	title: string,
	description: string,
): void {
	addToast({
		description,
		title,
		type: "success",
	});
}

/**
 * Show an info toast
 */
export function showInfoToast(
	addToast: ToastFn,
	title: string,
	description: string,
): void {
	addToast({
		description,
		title,
		type: "info",
	});
}

/**
 * Show a warning toast
 */
export function showWarningToast(
	addToast: ToastFn,
	title: string,
	description: string,
): void {
	addToast({
		description,
		title,
		type: "warning",
	});
}
