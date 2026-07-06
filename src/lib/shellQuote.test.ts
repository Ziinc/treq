import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { shellQuote } from "./shellQuote";

describe("shellQuote", () => {
	it("wraps a plain string in single quotes", () => {
		expect(shellQuote("hello world")).toBe("'hello world'");
	});

	it("escapes a single embedded quote", () => {
		expect(shellQuote("the file's contents")).toBe(
			"'the file'\\''s contents'",
		);
	});

	it("escapes multiple embedded quotes, including adjacent ones", () => {
		expect(shellQuote("it's, don't, they're")).toBe(
			"'it'\\''s, don'\\''t, they'\\''re'",
		);
		expect(shellQuote("''")).toBe("''\\'''\\'''");
	});

	it("escapes quotes at the very start and end of the string", () => {
		expect(shellQuote("'leading")).toBe("''\\''leading'");
		expect(shellQuote("trailing'")).toBe("'trailing'\\'''");
	});

	it("leaves other shell metacharacters untouched, since single quotes neutralize them", () => {
		const value = 'a `backtick`, a $VAR, a "quote", a \\backslash, a !bang';
		expect(shellQuote(value)).toBe(`'${value}'`);
	});

	it("handles the empty string", () => {
		expect(shellQuote("")).toBe("''");
	});
});

describe("shellQuote round-trip through a real POSIX shell", () => {
	const roundTrip = (value: string): string =>
		execFileSync("bash", ["-c", `printf '%s' ${shellQuote(value)}`], {
			encoding: "utf8",
		});

	it("delivers strings with single quotes unchanged", () => {
		const value = "the file's main happy path, it's done, don't stop";
		expect(roundTrip(value)).toBe(value);
	});

	it("delivers strings mixing quotes, backticks, dollars, and bangs unchanged", () => {
		const value =
			"it's a \"quoted\" word with a `backtick`, a $VAR, and a bang! at the end";
		expect(roundTrip(value)).toBe(value);
	});

	it("delivers multi-line prompts with embedded apostrophes unchanged", () => {
		const value = [
			"Target all existing integration files. The screenshot test for",
			"each file should reuse the file's main happy path instead of",
			"duplicating complex setup from scratch.",
		].join("\n");
		expect(roundTrip(value)).toBe(value);
	});

	it("delivers a lone single quote unchanged", () => {
		expect(roundTrip("'")).toBe("'");
	});
});
