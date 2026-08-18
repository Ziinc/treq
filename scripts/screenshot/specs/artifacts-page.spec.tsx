import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { captureDocument } from "../capture";

it("captures the artifacts gallery opened from the sidebar button", async () => {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  const dir = path.join(repoPath, ".treq", "send");
  fs.mkdirSync(dir, { recursive: true });
  const notePath = path.join(dir, "note.txt");
  const imagePath = path.join(dir, "shot.svg");
  fs.writeFileSync(notePath, "hello from treq send\n");
  fs.writeFileSync(
    imagePath,
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
  <rect width="128" height="128" fill="#2563eb"/>
  <circle cx="64" cy="64" r="36" fill="#f8fafc"/>
</svg>
`,
  );
  fs.writeFileSync(
    path.join(dir, "manifest.jsonl"),
    `${JSON.stringify({
      id: "send-note",
      repo: repoPath,
      media_type: "text",
      path: notePath,
      title: "note.txt",
      received_at: 1,
    })}\n${JSON.stringify({
      id: "send-shot",
      repo: repoPath,
      media_type: "image",
      path: imagePath,
      title: "shot.svg",
      received_at: 2,
    })}\n`,
  );

  const user = userEvent.setup();
  render(<Dashboard />);

  await screen.findByRole("button", { name: "Settings" });
  expect(screen.getByRole("button", { name: "Artifacts" })).toBeTruthy();

  await captureDocument(document, {
    name: "artifacts-page-01-sidebar-button",
    expectations: [
      "An Artifacts icon button sits immediately to the left of the Settings gear in the sidebar header.",
      "The main workspace view is still showing; the artifacts page is not open yet.",
    ],
  });

  await user.click(screen.getByRole("button", { name: "Artifacts" }));
  await screen.findByTestId("artifacts-grid");
  expect(screen.getByTestId("artifact-thumb-send-shot")).toBeTruthy();
  expect(screen.getByTestId("artifact-thumb-send-note")).toBeTruthy();

  await captureDocument(document, {
    name: "artifacts-page-02-grid",
    expectations: [
      "The main pane heading is Artifacts with a Close button on the right.",
      "A thumbnail grid shows an image tile labeled shot.svg and a text tile labeled note.txt.",
      "The Artifacts sidebar button is highlighted as the current page.",
    ],
  });
}, 60000);
