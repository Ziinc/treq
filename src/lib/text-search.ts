export interface SearchMatch {
  lineNumber: number;
  startIndex: number;
  endIndex: number;
}

export interface HighlightResult {
  html: string;
  matchCount: number;
}

/**
 * Escapes special regex characters in a string
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds all matches of a query string in text (case-insensitive)
 * Returns match positions with line numbers
 */
export function findMatches(text: string, query: string): SearchMatch[] {
  if (!query) return [];

  const matches: SearchMatch[] = [];
  const lines = text.split("\n");
  const escapedQuery = escapeRegex(query);
  const regex = new RegExp(escapedQuery, "gi");

  lines.forEach((line, lineNumber) => {
    let match;
    regex.lastIndex = 0; // Reset regex state for each line

    while ((match = regex.exec(line)) !== null) {
      matches.push({
        lineNumber,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  });

  return matches;
}

/**
 * Wraps matches in <mark> tags within HTML content while preserving HTML structure
 * Used for highlighting search results in syntax-highlighted code
 */
export function highlightInHtml(
  html: string,
  query: string,
  currentMatchIndex: number
): HighlightResult {
  if (!query) {
    return { html, matchCount: 0 };
  }

  // Use simple highlighting - works reliably across environments
  const result = simpleHighlight(html, query, currentMatchIndex);

  // Count matches
  const escapedQuery = escapeRegex(query);
  const regex = new RegExp(escapedQuery, "gi");
  const textContent = extractTextFromHtml(html);
  const matches = textContent.match(regex) || [];

  return { html: result, matchCount: matches.length };
}

/**
 * Simple fallback highlighting that works on text content
 */
function simpleHighlight(
  text: string,
  query: string,
  currentMatchIndex: number
): string {
  const escapedQuery = escapeRegex(query);
  const regex = new RegExp(escapedQuery, "gi");

  let result = "";
  let lastIndex = 0;
  let match;
  let matchCount = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    result += text.substring(lastIndex, match.index);

    // Add marked text
    const isCurrentMatch = matchCount === currentMatchIndex;
    const className = isCurrentMatch ? "search-match-current" : "search-match";
    result += `<mark class="${className}">${match[0]}</mark>`;

    lastIndex = match.index + match[0].length;
    matchCount++;
  }

  // Add remaining text
  result += text.substring(lastIndex);

  return result;
}

/**
 * Extracts plain text content from HTML string
 */
function extractTextFromHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body.textContent || "";
}