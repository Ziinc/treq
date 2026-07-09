/**
 * Quote a string for safe use as a single argument to a POSIX shell (sh/bash/zsh).
 * Wrapping a value in single quotes means the shell does not interpret anything
 * inside it - no `$` expansion, backtick command substitution, `!` history
 * expansion, or backslash escapes - except the single quote character itself,
 * which ends the quoted string. To include a literal single quote, close the
 * current quote, emit an escaped single quote, then reopen the quote:
 * `'` -> `'\''`.
 */
export const shellQuote = (value: string): string =>
	`'${value.replace(/'/g, `'\\''`)}'`;
