import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./utils";

function mockExecCommand(returnValue: boolean) {
	const execCommand = vi.fn().mockReturnValue(returnValue);
	Object.defineProperty(document, "execCommand", {
		configurable: true,
		writable: true,
		value: execCommand,
	});
	return execCommand;
}

describe("copyTextToClipboard", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		Reflect.deleteProperty(document, "execCommand");
	});

	it("uses navigator.clipboard.writeText when available", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);

		await copyTextToClipboard("src/example.ts");

		expect(writeText).toHaveBeenCalledWith("src/example.ts");
	});

	it("falls back to execCommand when clipboard writeText rejects", async () => {
		vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
			new Error("denied"),
		);
		const execCommand = mockExecCommand(true);

		await copyTextToClipboard("src/fallback.ts");

		expect(execCommand).toHaveBeenCalledWith("copy");
	});

	it("throws when both clipboard API and execCommand fail", async () => {
		vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
			new Error("denied"),
		);
		mockExecCommand(false);

		await expect(copyTextToClipboard("nope")).rejects.toThrow(
			"Failed to copy to clipboard",
		);
	});
});
