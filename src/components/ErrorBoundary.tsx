import React from "react";
import { Clipboard } from "lucide-react";
import { Button } from "./ui/button";

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  resetKeys?: unknown[];
  onReset?: () => void;
}

interface ConsoleLog {
  timestamp: string;
  type: "log" | "error" | "warn" | "info";
  args: string[];
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  consoleLogs: ConsoleLog[];
  copyStatus: string | null;
}

const resetArrayChanged = (a?: unknown[], b?: unknown[]) => {
  if (!a && !b) {
    return false;
  }
  if ((a?.length ?? 0) !== (b?.length ?? 0)) {
    return true;
  }
  for (let i = 0; i < (a?.length ?? 0); i += 1) {
    if (a?.[i] !== b?.[i]) {
      return true;
    }
  }
  return false;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  };

  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    componentStack: null,
    consoleLogs: [],
    copyStatus: null,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ componentStack: errorInfo.componentStack ?? null });
  }

  componentDidMount() {
    if (import.meta.env.DEV) {
      this.interceptConsole();
    }
  }

  componentWillUnmount() {
    if (import.meta.env.DEV) {
      this.restoreConsole();
    }
  }

  private interceptConsole = () => {
    const captureLog = (type: ConsoleLog["type"]) => (...args: unknown[]) => {
      // Call original console method
      this.originalConsole[type](...args);

      // Capture the log
      const timestamp = new Date().toISOString();
      const serializedArgs = args.map((arg) => {
        try {
          return typeof arg === "string" ? arg : JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      });

      this.setState((prev) => ({
        consoleLogs: [
          ...prev.consoleLogs,
          { timestamp, type, args: serializedArgs },
        ],
      }));
    };

    console.log = captureLog("log");
    console.error = captureLog("error");
    console.warn = captureLog("warn");
    console.info = captureLog("info");
  };

  private restoreConsole = () => {
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
  };

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && resetArrayChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: null,
      consoleLogs: [],
      copyStatus: null,
    });
    this.props.onReset?.();
  };

  private copyErrorDetails = async () => {
    const { error, componentStack, consoleLogs } = this.state;

    const errorDetails = [
      "=== ERROR DETAILS ===",
      `Message: ${error?.message || "Unknown error"}`,
      "",
      "=== STACK TRACE ===",
      error?.stack || "No stack trace available",
      "",
      "=== COMPONENT STACK ===",
      componentStack || "No component stack available",
      "",
      "=== CONSOLE LOGS ===",
      consoleLogs.length > 0
        ? consoleLogs
            .map(
              (log) =>
                `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.type.toUpperCase()}] ${log.args.join(" ")}`
            )
            .join("\n")
        : "No console logs captured",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(errorDetails);
      this.setState({ copyStatus: "Copied to clipboard!" });
      setTimeout(() => this.setState({ copyStatus: null }), 3000);
    } catch {
      this.setState({ copyStatus: "Failed to copy" });
      setTimeout(() => this.setState({ copyStatus: null }), 3000);
    }
  };

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;
      const { error, componentStack, consoleLogs, copyStatus } = this.state;

      return (
        <div className="flex h-full flex-col items-center justify-start gap-6 p-6 overflow-auto">
          <div className="space-y-2 max-w-4xl w-full">
            <h2 className="text-xl font-semibold text-center">
              {this.props.fallbackTitle || "Something went wrong"}
            </h2>
            <p className="text-sm text-muted-foreground break-words text-center">
              {error?.message || "An unexpected error occurred."}
            </p>
          </div>

          {isDev && (
            <div className="flex gap-2">
              <Button onClick={this.resetErrorBoundary}>Reset</Button>
              <Button variant="outline" onClick={this.copyErrorDetails}>
                <Clipboard className="size-4" />
                {copyStatus || "Copy Error"}
              </Button>
            </div>
          )}

          {isDev && (
            <pre className="w-full max-w-4xl bg-muted p-4 rounded-md text-sm overflow-auto max-h-96 font-mono whitespace-pre-wrap">
              {[
                "=== STACK TRACE ===",
                error?.stack || "No stack trace available",
                "",
                componentStack && "=== COMPONENT STACK ===",
                componentStack,
                componentStack && "",
                `=== CONSOLE LOGS (${consoleLogs.length}) ===`,
                consoleLogs.length > 0
                  ? consoleLogs.map((log) => `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.type.toUpperCase()}] ${log.args.join(" ")}`).join("\n")
                  : "No console logs captured",
              ].filter(Boolean).join("\n")}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
