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
export function showErrorToast(addToast: ToastFn, title: string, error: unknown): void {
  addToast({
    title,
    description: error instanceof Error ? error.message : String(error),
    type: "error",
  });
}

/**
 * Show a success toast
 */
export function showSuccessToast(addToast: ToastFn, title: string, description: string): void {
  addToast({
    title,
    description,
    type: "success",
  });
}

/**
 * Show an info toast
 */
export function showInfoToast(addToast: ToastFn, title: string, description: string): void {
  addToast({
    title,
    description,
    type: "info",
  });
}

/**
 * Show a warning toast
 */
export function showWarningToast(addToast: ToastFn, title: string, description: string): void {
  addToast({
    title,
    description,
    type: "warning",
  });
}
