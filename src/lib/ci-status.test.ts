import { describe, expect, it } from "vitest";
import { compareCiChecksBySeverity, formatCheckDuration } from "./ci-status";

describe("formatCheckDuration", () => {
	it("formats seconds only under one minute", () => {
		expect(formatCheckDuration(42)).toBe("42s");
	});

	it("formats minutes and seconds like GitHub Actions", () => {
		expect(formatCheckDuration(5 * 60 + 56)).toBe("5m 56s");
	});

	it("formats hours when present", () => {
		expect(formatCheckDuration(1 * 3600 + 2 * 60 + 3)).toBe("1h 2m 3s");
	});
});

describe("compareCiChecksBySeverity", () => {
	it("orders failure before pending before success", () => {
		const checks = [
			{ name: "build", bucket: "pass", link: "https://x/1" },
			{ name: "lint", bucket: "pending", link: "https://x/2" },
			{ name: "test", bucket: "fail", link: "https://x/3" },
			{ name: "skip", bucket: "skipping", link: "https://x/4" },
			{ name: "cancel", bucket: "cancel", link: "https://x/5" },
		];
		expect(
			[...checks].sort(compareCiChecksBySeverity).map((check) => check.name),
		).toEqual(["test", "cancel", "lint", "build", "skip"]);
	});
});
