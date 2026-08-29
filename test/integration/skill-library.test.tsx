import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { createTestRepo, openRepo } from "../utils";
import { render, screen } from "../test-utils";
import { Dashboard } from "../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";

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
  const catalog = {
    generatedAt: new Date().toISOString(),
    sources: [{ id: "test", name: "Test", url: "https://example.test" }],
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
  };
  const catalogPath = path.join(dir, "catalog.json");
  fs.writeFileSync(catalogPath, JSON.stringify(catalog));
  process.env.TREQ_SKILLS_CATALOG_URL = catalogPath;
  return catalogPath;
}

describe("skill library", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    const { repoPath } = createTestRepo(false);
    openRepo(repoPath);
    writeCatalog();
    user = userEvent.setup();
  });

  it("browses the registry and installs a skill for the application", async () => {
    render(<Dashboard />);

    await user.click(await screen.findByLabelText("Settings"));
    await user.click(await screen.findByRole("tab", { name: /skills/i }));

    expect(await screen.findByTestId("skill-library-settings")).toBeTruthy();
    expect(await screen.findByText("demo skill")).toBeTruthy();

    await user.click(
      await screen.findByRole("button", { name: /install for application/i }),
    );

    expect(await screen.findByLabelText(/install level for demo/i)).toHaveValue(
      "application",
    );
  });
});
