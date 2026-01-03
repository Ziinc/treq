import { describe, it, expect } from "vitest";
import { escapeRegex, findMatches, highlightInHtml } from "../src/lib/text-search";

describe("text-search utilities", () => {
  describe("escapeRegex", () => {
    it("escapes special regex characters", () => {
      expect(escapeRegex("test.txt")).toBe("test\\.txt");
      expect(escapeRegex("func()")).toBe("func\\(\\)");
      expect(escapeRegex("[test]")).toBe("\\[test\\]");
      expect(escapeRegex("$variable")).toBe("\\$variable");
      expect(escapeRegex("a*b+c?")).toBe("a\\*b\\+c\\?");
    });

    it("handles strings without special characters", () => {
      expect(escapeRegex("hello")).toBe("hello");
      expect(escapeRegex("test123")).toBe("test123");
    });

    it("handles empty string", () => {
      expect(escapeRegex("")).toBe("");
    });
  });

  describe("findMatches", () => {
    it("finds all occurrences of query in text", () => {
      const text = "hello world\nhello there\nHELLO WORLD";
      const matches = findMatches(text, "hello");

      expect(matches).toHaveLength(3);
      expect(matches[0]).toEqual({ lineNumber: 0, startIndex: 0, endIndex: 5 });
      expect(matches[1]).toEqual({ lineNumber: 1, startIndex: 0, endIndex: 5 });
      expect(matches[2]).toEqual({ lineNumber: 2, startIndex: 0, endIndex: 5 });
    });

    it("returns correct line numbers and offsets", () => {
      const text = "line one\nline two has match\nline three";
      const matches = findMatches(text, "match");

      expect(matches).toHaveLength(1);
      expect(matches[0]).toEqual({ lineNumber: 1, startIndex: 13, endIndex: 18 });
    });

    it("handles case-insensitive search", () => {
      const text = "Test test TEST tEsT";
      const matches = findMatches(text, "test");

      expect(matches).toHaveLength(4);
    });

    it("returns empty array for no matches", () => {
      const text = "hello world";
      const matches = findMatches(text, "goodbye");

      expect(matches).toEqual([]);
    });

    it("handles special regex characters in query", () => {
      const text = "function test() { return; }";
      const matches = findMatches(text, "test()");

      expect(matches).toHaveLength(1);
      expect(matches[0].startIndex).toBe(9);
    });

    it("handles empty query", () => {
      const text = "hello world";
      const matches = findMatches(text, "");

      expect(matches).toEqual([]);
    });

    it("handles multiple matches on same line", () => {
      const text = "test test test";
      const matches = findMatches(text, "test");

      expect(matches).toHaveLength(3);
      expect(matches[0].startIndex).toBe(0);
      expect(matches[1].startIndex).toBe(5);
      expect(matches[2].startIndex).toBe(10);
    });

    it("handles multiline text correctly", () => {
      const text = "first line\nsecond line\nthird line";
      const matches = findMatches(text, "line");

      expect(matches).toHaveLength(3);
      expect(matches[0].lineNumber).toBe(0);
      expect(matches[1].lineNumber).toBe(1);
      expect(matches[2].lineNumber).toBe(2);
    });
  });

  describe("highlightInHtml", () => {
    it("wraps matches in <mark> tags with plain text", () => {
      const html = "hello world";
      const result = highlightInHtml(html, "world", -1);

      expect(result.html).toBe('hello <mark class="search-match">world</mark>');
      expect(result.matchCount).toBe(1);
    });

    it("applies current-match class to active match", () => {
      const html = "test test test";
      const result = highlightInHtml(html, "test", 1);

      expect(result.html).toContain('class="search-match"');
      expect(result.html).toContain('class="search-match-current"');
      expect(result.matchCount).toBe(3);
    });

    it("handles multiple matches on same line", () => {
      const html = "foo bar foo";
      const result = highlightInHtml(html, "foo", -1);

      expect(result.html).toBe('<mark class="search-match">foo</mark> bar <mark class="search-match">foo</mark>');
      expect(result.matchCount).toBe(2);
    });

    it("handles HTML entities correctly", () => {
      // DOMParser decodes entities, which is correct for search purposes
      const html = "&lt;div&gt; test &lt;/div&gt;";
      const result = highlightInHtml(html, "test", -1);

      // The match should be found regardless of entity encoding
      expect(result.html).toContain('<mark class="search-match">test</mark>');
      expect(result.matchCount).toBe(1);

      // Can also search for the decoded content
      const result2 = highlightInHtml(html, "div", -1);
      expect(result2.matchCount).toBeGreaterThanOrEqual(1);
    });

    it("handles case-insensitive matching", () => {
      const html = "Test TEST test";
      const result = highlightInHtml(html, "test", -1);

      expect(result.matchCount).toBe(3);
    });

    it("returns original html when query is empty", () => {
      const html = "hello world";
      const result = highlightInHtml(html, "", -1);

      expect(result.html).toBe(html);
      expect(result.matchCount).toBe(0);
    });

    it("wraps matches while preserving Prism.js spans", () => {
      const html = '<span class="token keyword">function</span> <span class="token function">test</span>';
      const result = highlightInHtml(html, "function", -1);

      // Should preserve the span structure while adding marks
      expect(result.html).toContain('<span class="token keyword">');
      expect(result.html).toContain('<mark class="search-match">');
      expect(result.matchCount).toBe(1);
    });

    it("handles matches that span across token boundaries", () => {
      const html = '<span class="token">hel</span><span class="token">lo</span>';
      const result = highlightInHtml(html, "hello", -1);

      // Should find the match even if it spans tokens
      expect(result.html).toContain("mark");
      expect(result.matchCount).toBe(1);
    });

    it("correctly counts matches in HTML content", () => {
      const html = '<span class="token">test</span> another <span>test</span> and test';
      const result = highlightInHtml(html, "test", -1);

      expect(result.matchCount).toBe(3);
    });

    it("handles nested HTML tags", () => {
      const html = '<div><span class="token keyword">const</span></div>';
      const result = highlightInHtml(html, "const", -1);

      expect(result.html).toContain('<mark class="search-match">const</mark>');
      expect(result.matchCount).toBe(1);
    });

    it("highlights only the specified current match", () => {
      const html = "test test test";
      const result = highlightInHtml(html, "test", 0);

      // Count how many times each class appears
      const currentMatchCount = (result.html.match(/search-match-current/g) || []).length;
      const regularMatchCount = (result.html.match(/search-match"/g) || []).length;

      expect(currentMatchCount).toBe(1);
      expect(regularMatchCount).toBe(2);
    });
  });
});
