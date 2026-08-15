import * as React from "react";
import { execFileSync } from "node:child_process";
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
  execFileSync("git", args, { cwd, encoding: "utf8" });
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

it("captures nested submodule path with GitHub-style pin and Sync toggle", async () => {
  const { repoPath } = createTestRepo(false);
  const sub = createSubmoduleRepo();
  execFileSync(
    "git",
    ["-c", "protocol.file.allow=always", "submodule", "add", sub, "vendor/lib"],
    { cwd: repoPath, encoding: "utf8" },
  );
  git(repoPath, ["commit", "-m", "add submodule"]);
  fs.rmSync(path.join(repoPath, "vendor/lib"), { recursive: true, force: true });
  openRepo(repoPath);

  const user = userEvent.setup();
  render(<Dashboard />);

  const row = await screen.findByTestId("submodule-row-vendor/lib");
  await waitFor(() => {
    expect(row.textContent).toContain("vendor/lib");
    expect(row.textContent).toContain("@");
  });
  const sync = screen.getByRole("checkbox", { name: "Sync vendor/lib" });
  expect(sync).not.toBeChecked();

  await captureDocument(document, {
    name: "git-submodules-01-missing",
    expectations: [
      "The Code tab file list includes a vendor/lib row.",
      "The row shows an @ short SHA like GitHub submodule listings.",
      "A Sync checkbox is pulled to the right and is unchecked.",
    ],
  });

  await user.click(sync);
  await waitFor(() => {
    expect(
      screen.getByRole("checkbox", { name: "Sync vendor/lib" }),
    ).toBeChecked();
  });

  await captureDocument(document, {
    name: "git-submodules-02-at-pin",
    expectations: [
      "The vendor/lib row is still in the file list.",
      "The Sync checkbox on that row is checked.",
    ],
  });
}, 90000);
