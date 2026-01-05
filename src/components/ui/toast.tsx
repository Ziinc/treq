import * as React from "react"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

export type ToastType = "success" | "error" | "info" | "warning"

interface Toast {
  id: string
  title: string
  description?: string
  type: ToastType
}

const ToastContext = React.createContext<{
  toasts: Toast[]
  addToast: (toast: Omit<Toast, "id">) => void
  removeToast: (id: string) => void
} | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(7)
    setToasts((prev) => [...prev, { ...toast, id }])
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const typeStyles = {
    success: "bg-green-600 dark:bg-green-700 border border-green-500/30 dark:border-green-600/30 text-white",
    error: "bg-destructive dark:bg-destructive/90 border border-destructive/30 text-destructive-foreground",
    warning: "bg-orange-600 dark:bg-orange-700 border border-orange-500/30 dark:border-orange-600/30 text-white",
    info: "bg-primary dark:bg-primary/90 border border-primary/30 text-primary-foreground",
  }

  return (
    <div
      className={cn(
        "min-w-[300px] rounded-xl py-2.5 px-4 shadow-lg animate-in slide-in-from-left",
        typeStyles[toast.type]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="text-base font-medium">{toast.title}</div>
          {toast.description && (
            <div className="text-base opacity-90 mt-0.5">{toast.description}</div>
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
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within ToastProvider")
  }
  return context
}

