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
	currentMatchIndex: number,
): HighlightResult {
	if (!query) {
		return { html, matchCount: 0 };
	}

	// Use simple highlighting - works reliably across environments
	const result = simpleHighlight(html, query, currentMatchIndex);

	return { html: result.html, matchCount: result.matchCount };
}

/**
 * Highlights search matches in text content only, skipping HTML tags.
 * Splits HTML into tag vs text segments and only applies highlighting to text segments.
 */
function simpleHighlight(
	html: string,
	query: string,
	currentMatchIndex: number,
): { html: string; matchCount: number } {
	const escapedQuery = escapeRegex(query);
	const regex = new RegExp(escapedQuery, "gi");

	// Split HTML into tags and text segments
	const parts = html.split(/(<[^>]*>)/);

	let result = "";
	let matchCount = 0;

	for (const part of parts) {
		if (part.startsWith("<")) {
			// HTML tag — pass through unchanged
			result += part;
		} else {
			// Text content — apply highlighting
			let lastIndex = 0;
			let match;
			regex.lastIndex = 0;

			let segment = "";
			while ((match = regex.exec(part)) !== null) {
				segment += part.substring(lastIndex, match.index);
				const isCurrentMatch = matchCount === currentMatchIndex;
				const className = isCurrentMatch
					? "search-match-current"
					: "search-match";
				segment += `<mark class="${className}">${match[0]}</mark>`;
				lastIndex = match.index + match[0].length;
				matchCount++;
			}
			segment += part.substring(lastIndex);
			result += segment;
		}
	}

	return { html: result, matchCount };
}
