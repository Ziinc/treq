import { describe, expect, it } from "vitest";
import { getFileName } from "../src/lib/utils";

describe("getFileName", () => {
	it("extracts filename from path with directories", () => {
		expect(getFileName("src/components/LinearCommitHistory.tsx")).toBe(
			"LinearCommitHistory.tsx",
		);
	});

	it("extracts filename from deeply nested path", () => {
		expect(getFileName("src/lib/utils/helpers/format.ts")).toBe("format.ts");
	});

	it("returns the string itself if no directory separator", () => {
		expect(getFileName("README.md")).toBe("README.md");
	});

	it("handles empty string", () => {
		expect(getFileName("")).toBe("");
	});

	it("handles path ending with separator", () => {
		expect(getFileName("src/components/")).toBe("");
	});

	it("handles Windows-style paths", () => {
		expect(getFileName("src\\components\\Dashboard.tsx")).toBe("Dashboard.tsx");
	});
});
