import { describe, it, expect } from "vitest";
import { getFileName, escapeBashString } from "../src/lib/utils";

describe("getFileName", () => {
  it("extracts filename from path with directories", () => {
    expect(getFileName("src/components/LinearCommitHistory.tsx")).toBe("LinearCommitHistory.tsx");
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

describe("escapeBashString", () => {
  it("escapes single quotes", () => {
    expect(escapeBashString("It's a test")).toBe("It\\'s a test");
  });

  it("escapes backslashes", () => {
    expect(escapeBashString("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  it("escapes newlines", () => {
    expect(escapeBashString("line1\nline2")).toBe("line1\\nline2");
  });

  it("escapes multi-line markdown with code blocks", () => {
    const input = `## Code Review

### Comments

src/file.tsx:10
\`\`\`
const x = 'test';
\`\`\`
> Fix this issue`;

    const expected = "## Code Review\\n\\n### Comments\\n\\nsrc/file.tsx:10\\n```\\nconst x = \\'test\\';\\n```\\n> Fix this issue";
    expect(escapeBashString(input)).toBe(expected);
  });

  it("handles empty string", () => {
    expect(escapeBashString("")).toBe("");
  });

  it("escapes all special characters together", () => {
    expect(escapeBashString("test\\with'quotes\nand newlines")).toBe("test\\\\with\\'quotes\\nand newlines");
  });
});



