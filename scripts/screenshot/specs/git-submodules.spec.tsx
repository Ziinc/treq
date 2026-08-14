import * as React from "react";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "../../../src/components/Dashboard";
import { render, screen, waitFor } from "../../../test/test-utils";
import { createTestRepo, openRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

function git(cwd: string, args: string[]) {
  execSync(`git ${args.join(" ")}`, { cwd, encoding: "utf8" });
}

function createSubmoduleRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "treq-sub-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test User"]);
  fs.writeFileSync(path.join(dir, "README.md"), "sub\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

it("captures readonly submodule missing then checkout", async () => {
  const { repoPath } = createTestRepo(false);
  const sub = createSubmoduleRepo();
  execSync(`git -c protocol.file.allow=always submodule add ${sub} vendor/lib`, {
    cwd: repoPath,
    encoding: "utf8",
  });
  git(repoPath, ["commit", "-m", "add submodule"]);
  fs.rmSync(path.join(repoPath, "vendor/lib"), { recursive: true, force: true });
  openRepo(repoPath);

  const user = userEvent.setup();
  render(<Dashboard />);

  const panel = await screen.findByTestId("submodules-panel");
  expect(panel.textContent).toContain("vendor/lib");
  expect(panel.textContent).toContain("missing");

  await captureDocument(document, {
    name: "git-submodules-01-missing",
    expectations: [
      "A Submodules panel is visible on the Code tab.",
      "The panel lists vendor/lib as missing.",
      "An Update button is visible on the panel.",
    ],
  });

  await user.click(screen.getByRole("button", { name: "Update" }));
  await waitFor(() => {
    expect(screen.getByTestId("submodules-panel").textContent).toContain(
      "at pin",
    );
  });

  await captureDocument(document, {
    name: "git-submodules-02-at-pin",
    expectations: [
      "The Submodules panel still lists vendor/lib.",
      "The row shows at pin instead of missing.",
      "The Update button is no longer shown.",
    ],
  });
}, 90000);
