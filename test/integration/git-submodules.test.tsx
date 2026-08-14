import * as React from "react";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../utils";
import { render, screen, waitFor } from "../test-utils";
import { Dashboard } from "../../src/components/Dashboard";

function git(cwd: string, args: string[]) {
	return execSync(`git ${args.join(" ")}`, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, GIT_CONFIG_COUNT: "0" },
	});
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

describe("readonly git submodules", () => {
	let repoPath: string;
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		({ repoPath } = createTestRepo(false));
		const sub = createSubmoduleRepo();
		execSync(
			`git -c protocol.file.allow=always submodule add ${sub} vendor/lib`,
			{ cwd: repoPath, encoding: "utf8" },
		);
		git(repoPath, ["commit", "-m", "add submodule"]);
		fs.rmSync(path.join(repoPath, "vendor/lib"), {
			recursive: true,
			force: true,
		});
		openRepo(repoPath);
		user = userEvent.setup();
	});

	it("shows a missing submodule and checks it out on update", async () => {
		render(<Dashboard />);

		const panel = await screen.findByTestId("submodules-panel");
		expect(panel.textContent).toContain("vendor/lib");
		expect(panel.textContent).toContain("missing");

		await user.click(screen.getByRole("button", { name: "Update" }));

		await waitFor(() => {
			expect(screen.getByTestId("submodules-panel").textContent).toContain(
				"at pin",
			);
		});
		expect(fs.existsSync(path.join(repoPath, "vendor/lib/.git"))).toBe(true);
	});
});
