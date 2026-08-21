import { useCallback, useRef } from "react";
import type { Workspace } from "../lib/api";
import type { FlattenedWorkspaceNode } from "../lib/workspace-tree";

export function isModifierMouseEvent(
  event: React.MouseEvent | React.PointerEvent,
): boolean {
  return (
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.getModifierState("Shift") ||
    event.getModifierState("Meta") ||
    event.getModifierState("Control")
  );
}

export function idsInVisibleRange(
  nodes: FlattenedWorkspaceNode[],
  fromIndex: number,
  toIndex: number,
): Set<number> {
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  const ids = new Set<number>();
  for (let i = start; i <= end; i++) {
    ids.add(nodes[i].status.current.id);
  }
  return ids;
}

export function useWorkspaceSidebarMultiSelect({
  flattenedNodes,
  onSelectStack,
  onWorkspaceMultiSelect,
  onWorkspaceClick,
}: {
  flattenedNodes: FlattenedWorkspaceNode[];
  onSelectStack?: (workspaceIds: Set<number>) => void;
  onWorkspaceMultiSelect?: (
    workspace: Workspace | null,
    event: React.MouseEvent,
  ) => void;
  onWorkspaceClick?: (workspace: Workspace) => void;
}) {
  const lastSelectedIndexRef = useRef<number | null>(null);

  const clearLastSelectedIndex = useCallback(() => {
    lastSelectedIndexRef.current = null;
  }, []);

  const handleItemSelect = useCallback(
    (
      workspace: Workspace,
      event: React.MouseEvent | React.PointerEvent,
      index: number,
    ) => {
      if (event.shiftKey || event.getModifierState("Shift")) {
        if (lastSelectedIndexRef.current !== null && onSelectStack) {
          onSelectStack(
            idsInVisibleRange(
              flattenedNodes,
              lastSelectedIndexRef.current,
              index,
            ),
          );
          return;
        }
      }
      lastSelectedIndexRef.current = index;
      if (onWorkspaceMultiSelect) {
        onWorkspaceMultiSelect(workspace, event);
        return;
      }
      onWorkspaceClick?.(workspace);
    },
    [flattenedNodes, onSelectStack, onWorkspaceMultiSelect, onWorkspaceClick],
  );

  return { handleItemSelect, clearLastSelectedIndex };
}

export function useWorkspaceRowPointerHandlers({
  onSelect,
}: {
  onSelect: (event: React.MouseEvent | React.PointerEvent) => void;
}) {
  const skipClickRef = useRef(false);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (!isModifierMouseEvent(event)) return;
    skipClickRef.current = true;
    onSelect(event);
  };

  const onMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if (!isModifierMouseEvent(event)) return;
    skipClickRef.current = true;
    onSelect(event);
  };

  const onClick = (event: React.MouseEvent) => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onSelect(event);
  };

  return { onPointerDown, onMouseDown, onClick };
}
