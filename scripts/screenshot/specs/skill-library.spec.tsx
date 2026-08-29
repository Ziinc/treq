import * as React from "react";
import { expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { captureDocument } from "../capture";
import { uninstallSkill } from "../../../src/lib/api";

function skillChecksum(files: { path: string; content: Buffer }[]): string {
  const hash = crypto.createHash("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update(Buffer.from([0]));
    const len = Buffer.alloc(8);
    len.writeBigUInt64BE(BigInt(file.content.length));
    hash.update(len);
    hash.update(file.content);
  }
  return hash.digest("hex");
}

function writeCatalog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "treq-skill-catalog-"));
  const skillMd = Buffer.from(
    "---\nname: demo\ndescription: demo skill\n---\n# Demo\n",
  );
  const skillPath = path.join(dir, "SKILL.md");
  fs.writeFileSync(skillPath, skillMd);
  const checksum = skillChecksum([{ path: "SKILL.md", content: skillMd }]);
  const catalogPath = path.join(dir, "catalog.json");
  fs.writeFileSync(
    catalogPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      sources: [{ id: "test", name: "Test" }],
      skills: [
        {
          id: "test/demo",
          name: "demo",
          description: "demo skill",
          source: "test",
          proprietary: false,
          checksum,
          files: [
            {
              path: "SKILL.md",
              size: skillMd.length,
              binary: false,
              rawUrl: `file://${skillPath}`,
            },
          ],
        },
      ],
    }),
  );
  process.env.TREQ_SKILLS_CATALOG_URL = catalogPath;
}

it("captures skill library browse and install", async () => {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);
  writeCatalog();
  await uninstallSkill("test/demo", repoPath).catch(() => undefined);

  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await screen.findByLabelText("Settings"));
  await user.click(await screen.findByRole("tab", { name: /skills/i }));
  expect(await screen.findByText("demo skill")).toBeTruthy();

  await captureDocument(document, {
    name: "skill-library-01-browse",
    expectations: [
      "The Settings page Skills tab is open.",
      "A skill named demo is listed with Install for application and Install for repository buttons.",
    ],
  });

  await user.click(
    await screen.findByRole("button", { name: /install for application/i }),
  );
  expect(await screen.findByLabelText(/install level for demo/i)).toHaveValue(
    "application",
  );

  await captureDocument(document, {
    name: "skill-library-02-installed",
    expectations: [
      "The demo skill shows an Install level select set to Application.",
      "An Uninstall button is visible for the installed skill.",
    ],
  });
}, 60000);
