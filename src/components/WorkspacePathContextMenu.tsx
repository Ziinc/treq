import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Copy, FolderOpen } from "lucide-react";
import { useEditorAppsStore } from "../stores/editorAppsStore";
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "./ui/context-menu";

export const PathContextMenuItems: React.FC<{
  relativePath: string;
  fullPath: string;
  additionalItems?: React.ReactNode;
}> = ({ relativePath, fullPath, additionalItems }) => {
  const editorApps = useEditorAppsStore();

  return (
    <>
      <ContextMenuItem
        onClick={() => navigator.clipboard.writeText(relativePath)}
      >
        <Copy className="w-4 h-4 mr-2" />
        Copy relative path
      </ContextMenuItem>
      <ContextMenuItem onClick={() => navigator.clipboard.writeText(fullPath)}>
        <Copy className="w-4 h-4 mr-2" />
        Copy full path
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <FolderOpen className="w-4 h-4 mr-2" />
          Open in...
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onClick={() => revealItemInDir(fullPath)}>
            <FolderOpen className="w-4 h-4 mr-2" />
            Open in Finder
          </ContextMenuItem>

          {editorApps.cursor && (
            <ContextMenuItem
              onClick={async () => {
                try {
                  await openUrl(`cursor://file/${fullPath}`);
                } catch (err) {
                  console.error("Failed to open in Cursor:", err);
                }
              }}
            >
              Open in Cursor
            </ContextMenuItem>
          )}

          {editorApps.vscode && (
            <ContextMenuItem
              onClick={async () => {
                try {
                  await openUrl(`vscode://file/${fullPath}`);
                } catch (err) {
                  console.error("Failed to open in VSCode:", err);
                }
              }}
            >
              Open in VSCode
            </ContextMenuItem>
          )}

          {editorApps.zed && (
            <ContextMenuItem
              onClick={async () => {
                try {
                  await openUrl(`zed://file/${fullPath}`);
                } catch (err) {
                  console.error("Failed to open in Zed:", err);
                }
              }}
            >
              Open in Zed
            </ContextMenuItem>
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>
      {additionalItems}
    </>
  );
};
