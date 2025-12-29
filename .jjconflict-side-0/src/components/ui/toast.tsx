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
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const typeStyles = {
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    warning: "bg-orange-600 text-white",
    info: "bg-blue-600 text-white",
  }

  return (
    <div
      className={cn(
        "min-w-[300px] rounded-lg p-4 shadow-lg animate-in slide-in-from-right",
        typeStyles[toast.type]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="font-semibold">{toast.title}</div>
          {toast.description && (
            <div className="text-sm opacity-90 mt-1">{toast.description}</div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors"
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

