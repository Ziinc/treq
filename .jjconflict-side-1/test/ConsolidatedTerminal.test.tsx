import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "./test-utils";
import { ConsolidatedTerminal } from "../src/components/ConsolidatedTerminal";
import * as api from "../src/lib/api";

// Mock xterm addons to avoid DOM issues in tests
vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    loadAddon = vi.fn();
    open = vi.fn();
    dispose = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
    onData = vi.fn();
    write = vi.fn();
    element = document.createElement("div");
    buffer = { active: {} };
    rows = 24;
    cols = 80;
    unicode = { activeVersion: "11" };
  }

  return {
    Terminal: MockTerminal,
  };
});

vi.mock("@xterm/addon-fit", () => {
  class MockFitAddon {
    fit = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

vi.mock("@xterm/addon-web-links", () => {
  class MockWebLinksAddon {}
  return { WebLinksAddon: MockWebLinksAddon };
});

vi.mock("@xterm/addon-unicode11", () => {
  class MockUnicode11Addon {}
  return { Unicode11Addon: MockUnicode11Addon };
});

vi.mock("@xterm/addon-ligatures", () => {
  class MockLigaturesAddon {}
  return { LigaturesAddon: MockLigaturesAddon };
});

vi.mock("@xterm/addon-webgl", () => {
  class MockWebglAddon {
    onContextLoss = vi.fn();
    dispose = vi.fn();
  }
  return { WebglAddon: MockWebglAddon };
});

vi.mock("@xterm/addon-search", () => {
  class MockSearchAddon {
    findNext = vi.fn();
    findPrevious = vi.fn();
    clearDecorations = vi.fn();
  }
  return { SearchAddon: MockSearchAddon };
});

describe("ConsolidatedTerminal autoCommand behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends autoCommand when creating a NEW PTY session", async () => {
    // Mock PTY API - session does NOT exist
    const mockPtySessionExists = vi.spyOn(api, "ptySessionExists").mockResolvedValue(false);
    const mockPtyCreateSession = vi.spyOn(api, "ptyCreateSession").mockResolvedValue(undefined);
    const mockPtyListen = vi.spyOn(api, "ptyListen").mockResolvedValue(() => {});
    const mockPtyWrite = vi.spyOn(api, "ptyWrite").mockResolvedValue(undefined);

    render(
      <ConsolidatedTerminal
        sessionId="test-session-1"
        workingDirectory="/test/dir"
        autoCommand="claude --permission-mode acceptEdits"
      />
    );

    // Wait for PTY setup to complete
    await waitFor(() => {
      expect(mockPtySessionExists).toHaveBeenCalledWith("test-session-1");
    });

    await waitFor(() => {
      expect(mockPtyCreateSession).toHaveBeenCalledWith(
        "test-session-1",
        "/test/dir",
        undefined
      );
    });

    await waitFor(() => {
      expect(mockPtyListen).toHaveBeenCalledWith("test-session-1", expect.any(Function));
    });

    // Verify autoCommand was sent (for NEW session)
    await waitFor(() => {
      expect(mockPtyWrite).toHaveBeenCalledWith(
        "test-session-1",
        "claude --permission-mode acceptEdits\r\n"
      );
    });
  });

  it("does NOT send autoCommand when PTY session already exists", async () => {
    // Mock PTY API - session DOES exist
    const mockPtySessionExists = vi.spyOn(api, "ptySessionExists").mockResolvedValue(true);
    const mockPtyCreateSession = vi.spyOn(api, "ptyCreateSession").mockResolvedValue(undefined);
    const mockPtyListen = vi.spyOn(api, "ptyListen").mockResolvedValue(() => {});
    const mockPtyWrite = vi.spyOn(api, "ptyWrite").mockResolvedValue(undefined);

    render(
      <ConsolidatedTerminal
        sessionId="test-session-2"
        workingDirectory="/test/dir"
        autoCommand="claude --permission-mode acceptEdits"
      />
    );

    // Wait for PTY setup to complete
    await waitFor(() => {
      expect(mockPtySessionExists).toHaveBeenCalledWith("test-session-2");
    });

    await waitFor(() => {
      expect(mockPtyListen).toHaveBeenCalledWith("test-session-2", expect.any(Function));
    });

    // Verify ptyCreateSession was NOT called (session exists)
    expect(mockPtyCreateSession).not.toHaveBeenCalled();

    // Verify autoCommand was NOT sent (for existing session)
    // Give it some time to ensure it's not called
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it("does NOT send autoCommand when component remounts with existing session", async () => {
    // Mock PTY API - session exists
    const mockPtySessionExists = vi.spyOn(api, "ptySessionExists").mockResolvedValue(true);
    const mockPtyListen = vi.spyOn(api, "ptyListen").mockResolvedValue(() => {});
    const mockPtyWrite = vi.spyOn(api, "ptyWrite").mockResolvedValue(undefined);

    const { unmount, rerender } = render(
      <ConsolidatedTerminal
        sessionId="test-session-3"
        workingDirectory="/test/dir"
        autoCommand="claude --permission-mode acceptEdits"
      />
    );

    // Wait for initial setup
    await waitFor(() => {
      expect(mockPtyListen).toHaveBeenCalled();
    });

    // Clear mocks and remount component
    vi.clearAllMocks();

    // Re-render with same props
    rerender(
      <ConsolidatedTerminal
        sessionId="test-session-3"
        workingDirectory="/test/dir"
        autoCommand="claude --permission-mode acceptEdits"
      />
    );

    // Give it some time to ensure autoCommand is not sent again
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify autoCommand was NOT sent on remount
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });
});
