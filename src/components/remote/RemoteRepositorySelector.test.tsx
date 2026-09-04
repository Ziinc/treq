import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../../test/test-utils";
import { RemoteRepositorySelector } from "./RemoteRepositorySelector";
import type { SavedRemoteRepositoryRecord } from "../../lib/remote-endpoints";

function repo(
  path: string,
  generation = 1,
): SavedRemoteRepositoryRecord {
  return {
    id: `id-${path}`,
    endpoint_id: "ep-1",
    endpoint_generation: generation,
    canonical_remote_path: path,
    display_name: path.split("/").pop() ?? path,
    last_successful_trust_validation: null,
  };
}

function props(
  overrides: Partial<ComponentProps<typeof RemoteRepositorySelector>> = {},
) {
  return {
    savedRepositories: [repo("/srv/alpha"), repo("/srv/beta")],
    selectedId: null as string | null,
    path: "",
    probe: null,
    cloneUrl: "",
    confirmInit: false,
    onSelectSaved: vi.fn(),
    onPathChange: vi.fn(),
    onProbe: vi.fn(),
    onCloneUrlChange: vi.fn(),
    onConfirmInitChange: vi.fn(),
    onOpenExisting: vi.fn(),
    onClone: vi.fn(),
    onInit: vi.fn(),
    ...overrides,
  };
}

describe("RemoteRepositorySelector", () => {
  it("lists saved repositories for the current endpoint", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<RemoteRepositorySelector {...p} />);

    await user.click(screen.getByRole("button", { name: /alpha/ }));
    expect(p.onSelectSaved).toHaveBeenCalledWith("id-/srv/alpha");
    expect(screen.getByRole("button", { name: /beta/ })).toBeInTheDocument();
  });

  it("offers typed clone when the probe says the path is not a repo", async () => {
    const user = userEvent.setup();
    const p = props({
      path: "/srv/new",
      probe: {
        host: "",
        path: "/srv/new",
        exists: false,
        is_repo: false,
        needs_clone: true,
      },
      cloneUrl: "https://example.com/repo.git",
    });
    render(<RemoteRepositorySelector {...p} />);

    expect(
      screen.queryByRole("button", { name: "Open" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clone repository" }));
    expect(p.onClone).toHaveBeenCalled();
  });

  it("does not initialize until the user explicitly confirms", async () => {
    const user = userEvent.setup();
    const p = props({
      path: "/srv/empty",
      probe: {
        host: "",
        path: "/srv/empty",
        exists: true,
        is_repo: false,
        needs_clone: true,
      },
    });
    render(<RemoteRepositorySelector {...p} />);

    expect(
      screen.getByRole("button", { name: "Initialize repository" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Confirm initialize empty repository",
      }),
    );
    expect(p.onConfirmInitChange).toHaveBeenCalledWith(true);
  });
});
