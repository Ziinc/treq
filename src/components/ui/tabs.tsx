import * as React from "react";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  orientation?: "horizontal" | "vertical";
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

const useTabsContext = () => {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within Tabs");
  }
  return context;
};

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
  children: React.ReactNode;
}

export const Tabs: React.FC<TabsProps> = ({
  value,
  onValueChange,
  orientation = "horizontal",
  className,
  children,
}) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange, orientation }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

interface TabsListProps {
  className?: string;
  children: React.ReactNode;
}

export const TabsList: React.FC<TabsListProps> = ({ className, children }) => {
  const { orientation } = useTabsContext();
  const baseClass = orientation === "vertical"
    ? "flex flex-col gap-1"
    : "flex gap-1 bg-muted p-1 rounded-md w-fit";

  return (
    <div className={`${baseClass} ${className || ""}`}>
      {children}
    </div>
  );
};

interface TabsTriggerProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

export const TabsTrigger: React.FC<TabsTriggerProps> = ({
  value: triggerValue,
  className,
  children,
}) => {
  const { value, onValueChange, orientation } = useTabsContext();
  const isActive = value === triggerValue;

  const baseClass = orientation === "vertical"
    ? `flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`
    : `px-3 py-1 font-medium transition-colors rounded-md ${
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
      }`;

  return (
    <button
      onClick={() => onValueChange(triggerValue)}
      className={`${baseClass} ${className || ""}`}
    >
      {children}
    </button>
  );
};

interface TabsContentProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

export const TabsContent: React.FC<TabsContentProps> = ({
  value: contentValue,
  className,
  children,
}) => {
  const { value } = useTabsContext();
  
  if (value !== contentValue) return null;

  return <div className={className}>{children}</div>;
};

