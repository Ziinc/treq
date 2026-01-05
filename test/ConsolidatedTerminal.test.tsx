import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "./test-utils";
import { ConsolidatedTerminal } from "../src/components/ConsolidatedTerminal";
import * as api from "../src/lib/api";

// Mock xterm addons to avoid DOM issues in tests
// Store the key handler for testing
let globalKeyHandler: ((event: KeyboardEvent) => boolean) | null = null;

vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    loadAddon = vi.fn();
    open = vi.fn();
    dispose = vi.fn();
    attachCustomKeyEventHandler = vi.fn((handler: (event: KeyboardEvent) => boolean) => {
      globalKeyHandler = handler;
    });
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

// Export function to get the captured handler
export function getGlobalKeyHandler() {
  return globalKeyHandler;
}

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

describe("ConsolidatedTerminal global shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalKeyHandler = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
    globalKeyHandler = null;
  });

  it("dispatches Cmd+K to window when terminal receives it", async () => {
    // Setup mocks
    const mockPtySessionExists = vi.spyOn(api, "ptySessionExists").mockResolvedValue(true);
    const mockPtyListen = vi.spyOn(api, "ptyListen").mockResolvedValue(() => {});

    // Setup window event listener spy
    const windowKeydownSpy = vi.fn();
    window.addEventListener("keydown", windowKeydownSpy);

    render(
      <ConsolidatedTerminal
        sessionId="test-session-shortcuts-k"
        workingDirectory="/test/dir"
      />
    );

    await waitFor(() => expect(mockPtyListen).toHaveBeenCalled());
    expect(globalKeyHandler).not.toBeNull();

    // Simulate Cmd+K in terminal
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    const result = globalKeyHandler!(event);

    // Verify handler returned false (don't process in xterm)
    expect(result).toBe(false);

    // Verify event was dispatched to window
    expect(windowKeydownSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: "k", metaKey: true })
    );

    window.removeEventListener("keydown", windowKeydownSpy);
  });

  it("dispatches Cmd+P to window when terminal receives it", async () => {
    // Setup mocks
    const mockPtySessionExists = vi.spyOn(api, "ptySessionExists").mockResolvedValue(true);
    const mockPtyListen = vi.spyOn(api, "ptyListen").mockResolvedValue(() => {});

    const windowKeydownSpy = vi.fn();
    window.addEventListener("keydown", windowKeydownSpy);

    render(
      <ConsolidatedTerminal
        sessionId="test-session-shortcuts-p"
        workingDirectory="/test/dir"
      />
    );

    await waitFor(() => expect(mockPtyListen).toHaveBeenCalled());
    expect(globalKeyHandler).not.toBeNull();

    // Simulate Cmd+P in terminal
    const event = new KeyboardEvent("keydown", { key: "p", metaKey: true });
    const result = globalKeyHandler!(event);

    expect(result).toBe(false);
    expect(windowKeydownSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: "p", metaKey: true })
    );

    window.removeEventListener("keydown", windowKeydownSpy);
  });

  it("dispatches Escape to window when terminal receives it", async () => {
    // Setup mocks
    const mockPtySessionExists = vi.spyOn(api, "ptySessionExists").mockResolvedValue(true);
    const mockPtyListen = vi.spyOn(api, "ptyListen").mockResolvedValue(() => {});

    const windowKeydownSpy = vi.fn();
    window.addEventListener("keydown", windowKeydownSpy);

    render(
      <ConsolidatedTerminal
        sessionId="test-session-shortcuts-esc"
        workingDirectory="/test/dir"
      />
    );

    await waitFor(() => expect(mockPtyListen).toHaveBeenCalled());
    expect(globalKeyHandler).not.toBeNull();

    // Simulate Escape in terminal
    const event = new KeyboardEvent("keydown", { key: "Escape" });
    const result = globalKeyHandler!(event);

    expect(result).toBe(false);
    expect(windowKeydownSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: "Escape" })
    );

    window.removeEventListener("keydown", windowKeydownSpy);
  });

  it("does NOT dispatch regular keys to window", async () => {
    // Setup mocks
    const mockPtySessionExists = vi.spyOn(api, "ptySessionExists").mockResolvedValue(true);
    const mockPtyListen = vi.spyOn(api, "ptyListen").mockResolvedValue(() => {});

    const windowKeydownSpy = vi.fn();
    window.addEventListener("keydown", windowKeydownSpy);

    render(
      <ConsolidatedTerminal
        sessionId="test-session-shortcuts-regular"
        workingDirectory="/test/dir"
      />
    );

    await waitFor(() => expect(mockPtyListen).toHaveBeenCalled());
    expect(globalKeyHandler).not.toBeNull();

    // Simulate regular key (letter 'a' without modifiers)
    const event = new KeyboardEvent("keydown", { key: "a" });
    const result = globalKeyHandler!(event);

    // Handler should allow xterm to process this key
    expect(result).toBe(true);

    // Verify event was NOT dispatched to window
    expect(windowKeydownSpy).not.toHaveBeenCalled();

    window.removeEventListener("keydown", windowKeydownSpy);
  });
});
