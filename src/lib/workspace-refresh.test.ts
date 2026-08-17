import { describe, expect, it } from "vitest";
import {
  pathIsAffected,
  visibleWorkspaceRefreshTarget,
} from "./workspace-refresh";

describe("visibleWorkspaceRefreshTarget", () => {
  it("refreshes the code diff on the Changes tab", () => {
    expect(
      visibleWorkspaceRefreshTarget({
        activeTab: "changes",
        showFileBrowser: false,
      }),
    ).toBe("changes-diff");
  });

  it("refreshes the commits list on the Commits tab", () => {
    expect(
      visibleWorkspaceRefreshTarget({
        activeTab: "commits",
        showFileBrowser: false,
      }),
    ).toBe("commits-list");
  });

  it("refreshes FileBrowser only while it is open on overview", () => {
    expect(
      visibleWorkspaceRefreshTarget({
        activeTab: "overview",
        showFileBrowser: true,
      }),
    ).toBe("file-browser");
    expect(
      visibleWorkspaceRefreshTarget({
        activeTab: "overview",
        showFileBrowser: false,
      }),
    ).toBe("none");
  });
});

describe("pathIsAffected", () => {
  it("treats an empty path list as affecting everything", () => {
    expect(pathIsAffected("/ws/src/app.ts")).toBe(true);
    expect(pathIsAffected("/ws/src/app.ts", [])).toBe(true);
  });

  it("matches the file, its parent directory, and nested children", () => {
    expect(pathIsAffected("/ws/src/app.ts", ["/ws/src/app.ts"])).toBe(true);
    expect(pathIsAffected("/ws/src", ["/ws/src/app.ts"])).toBe(true);
    expect(pathIsAffected("/ws/src/app.ts", ["/ws/src"])).toBe(true);
    expect(pathIsAffected("/ws/README.md", ["/ws/src/app.ts"])).toBe(false);
  });
});
