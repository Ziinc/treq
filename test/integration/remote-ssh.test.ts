import * as React from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Dashboard } from "../../src/components/Dashboard";
import { render, screen } from "../test-utils";
import {
  listSshHosts,
  remoteOpenRepo,
  remoteProbeRepo,
  setSetting,
} from "../../src/lib/api";

describe("remote SSH integration", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    window.history.replaceState({}, "", "/");
  });

  it("opens the remote setup dialog from onboarding", async () => {
    render(React.createElement(Dashboard));
    await user.click(
      await screen.findByRole("button", { name: "Open via SSH" }),
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Connect a remote repository",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Treq-managed VM/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Your own VM/ })).toBeTruthy();
  });

  it("restores the last remote repository without reading it locally", async () => {
    const remoteRepository = {
      host: "devbox",
      path: "/srv/project",
      display_name: "devbox:project",
      repo_uri: "ssh://devbox/srv/project",
      inspection: {
        root: "/srv/project",
        repository_type: "jj_colocated",
        current_branch: "main",
        default_branch: "main",
        current_change_id: "change-id",
        current_commit_id: "commit-id",
        descriptor: {
          id: "ssh:devbox:/srv/project",
          location: { type: "ssh", host: "devbox", path: "/srv/project" },
          display_name: "devbox:project",
        },
      },
    };
    await setSetting(
      "last_opened_remote_repo",
      JSON.stringify(remoteRepository),
    );

    render(React.createElement(Dashboard));

    expect(await screen.findByText("Remote repository connected")).toBeTruthy();
    expect(screen.getByText("devbox:/srv/project")).toBeTruthy();
    await setSetting("last_opened_remote_repo", "");
  });

  it("rejects unsafe SSH aliases before remote open dispatch", async () => {
    await expect(
      remoteOpenRepo("devbox; rm -rf /", "/srv/project"),
    ).rejects.toThrow("SSH host must be a host alias from ssh config");
  });

  it("rejects unsafe SSH host aliases before opening a connection", async () => {
    await expect(
      remoteProbeRepo("devbox; rm -rf /", "/srv/project"),
    ).rejects.toThrow("SSH host must be a host alias from ssh config");
  });

  it("lists SSH hosts as an array even when no user config is present", async () => {
    await expect(listSshHosts()).resolves.toEqual(expect.any(Array));
  });
});
