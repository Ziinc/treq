import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CiStatusIndicator } from "./CiStatusIndicator";
import * as api from "../lib/api";
import type { PrCiStatus } from "../lib/api-types";
import { render, screen } from "../../test/test-utils";

afterEach(() => {
	vi.restoreAllMocks();
});

const baseStatus: PrCiStatus = {
	state: "success",
	total: 2,
	passed: 2,
	failed: 0,
	pending: 0,
	checks: [
		{ name: "build", bucket: "pass", link: "https://x/1" },
		{ name: "lint", bucket: "pass", link: "https://x/2" },
	],
};

describe("CiStatusIndicator", () => {
	it("renders nothing while there is no CI status", async () => {
		const spy = vi.spyOn(api, "getPrChecksViaGh").mockResolvedValue(null);

		render(<CiStatusIndicator repoPath="/repo" branchName="feat" />);
		await waitFor(() => expect(spy).toHaveBeenCalled());
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("shows the passed/total ratio when CI succeeded", async () => {
		vi.spyOn(api, "getPrChecksViaGh").mockResolvedValue(baseStatus);

		render(<CiStatusIndicator repoPath="/repo" branchName="feat" />);

		expect(await screen.findByText("2/2")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /CI passed: 2\/2/ }),
		).toBeInTheDocument();
	});

	it("shows failing check names when CI failed", async () => {
		vi.spyOn(api, "getPrChecksViaGh").mockResolvedValue({
			...baseStatus,
			state: "failure",
			passed: 1,
			failed: 1,
			checks: [
				{ name: "build", bucket: "pass", link: "https://x/1" },
				{ name: "test", bucket: "fail", link: "https://x/2" },
			],
		});

		render(<CiStatusIndicator repoPath="/repo" branchName="feat" />);

		expect(
			await screen.findByRole("button", { name: /CI failed: 1\/2/ }),
		).toBeInTheDocument();
	});
});
