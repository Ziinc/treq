import { describe, expect, it } from "vitest";
import { formatCheckDuration } from "./ci-status";

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
