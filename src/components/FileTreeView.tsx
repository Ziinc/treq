import { useMemo, useState, useEffect } from "react";
import type { BranchDiffFileChange } from "../lib/api";
import { cn } from "../lib/utils";
import { Folder, FolderOpen, FileText } from "lucide-react";

interface FileTreeViewProps {
  files: BranchDiffFileChange[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  isLoading?: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  type: "folder" | "file";
  status?: string;
  children?: TreeNode[];
}

const buildTree = (files: BranchDiffFileChange[]): TreeNode[] => {
  const root: TreeNode = { name: "root", path: "", type: "folder", children: [] };

  files.forEach((file) => {
    const segments = file.path.split("/").filter(Boolean);
    let current = root;
    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      const childPath = current.path ? `${current.path}/${segment}` : segment;

      if (!current.children) {
        current.children = [];
      }

      let child = current.children.find((node) => node.name === segment);
      if (!child) {
        child = {
          name: segment,
          path: childPath,
          type: isFile ? "file" : "folder",
          ...(isFile ? { status: file.status } : { children: [] }),
        };
        current.children.push(child);
        current.children.sort((a, b) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name);
          }
          return a.type === "folder" ? -1 : 1;
        });
      }

      if (!isFile) {
        current = child;
      }
    });
  });

  return root.children ?? [];
};

const statusClasses: Record<string, string> = {
  A: "bg-green-500/20 text-green-600 dark:text-green-400",
  M: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
  D: "bg-red-500/20 text-red-600 dark:text-red-400",
  R: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
};

export const FileTreeView: React.FC<FileTreeViewProps> = ({
  files,
  selectedPath,
  onSelect,
  isLoading = false,
}) => {
  const tree = useMemo(() => buildTree(files), [files]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["root"]));

  useEffect(() => {
    if (!selectedPath) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      const parts = selectedPath.split("/");
      let path = "";
      parts.slice(0, -1).forEach((part) => {
        path = path ? `${path}/${part}` : part;
        next.add(path);
      });
      return next;
    });
  }, [selectedPath]);

  const toggleNode = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: TreeNode) => {
    if (node.type === "folder") {
      const isOpen = expanded.has(node.path);
      return (
        <div key={node.path} className="text-sm">
          <button
            type="button"
            className="flex items-center gap-2 w-full px-2 py-1 rounded-md hover:bg-muted/60"
            onClick={() => toggleNode(node.path)}
          >
            {isOpen ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
            <span className="font-medium text-left">{node.name}</span>
          </button>
          {isOpen && node.children && (
            <div className="pl-4 border-l border-border/50 ml-2">
              {node.children.map((child) => renderNode(child))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        type="button"
        onClick={() => onSelect(node.path)}
        className={cn(
          "w-full flex items-center justify-between px-2 py-1 rounded-md text-sm",
          "hover:bg-muted/60 transition",
          selectedPath === node.path && "bg-primary/10 border border-primary/40"
        )}
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="truncate text-left">{node.name}</span>
        </div>
        {node.status && (
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full", statusClasses[node.status] || "bg-muted")}
          >
            {node.status}
          </span>
        )}
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading file changes...
      </div>
    );
  }

  if (!files.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No differences between branches.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1 overflow-auto h-full">
      {tree.map((node) => renderNode(node))}
    </div>
  );
};
