import type { JjLogCommit } from "../../src/lib/api";

interface CommitFactoryOptions extends Partial<JjLogCommit> {}

/**
 * Generates random values for commit data
 */
function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function generateRandomTimestamp(): string {
  const date = new Date(2024, 0, Math.floor(Math.random() * 30) + 1);
  return date.toISOString().split("T")[0] + " " + date.toTimeString().split(" ")[0];
}

/**
 * Factory function to create mock commit objects
 * Randomly generates values unless overridden
 *
 * @example
 * // Generate default random commit
 * const commit = createMockCommit();
 *
 * // Override specific values
 * const customCommit = createMockCommit({
 *   description: "Fix: handle null values",
 *   author_name: "Alice"
 * });
 */
export function createMockCommit(overrides?: CommitFactoryOptions): JjLogCommit {
  const randomId = generateRandomId();
  const changeId = `change_${generateRandomId()}`;

  return {
    commit_id: randomId,
    short_id: randomId.substring(0, 6),
    change_id: changeId,
    description: "Test commit",
    author_name: "Test Author",
    timestamp: generateRandomTimestamp(),
    parent_ids: [],
    is_working_copy: false,
    bookmarks: [],
    insertions: Math.floor(Math.random() * 100),
    deletions: Math.floor(Math.random() * 50),
    ...overrides,
  };
}

/**
 * Factory function to create an array of mock commits
 * Useful for testing commit lists and ordering
 *
 * @example
 * // Create 3 commits with default values
 * const commits = createMockCommits(3);
 *
 * // Create 5 commits with custom descriptions
 * const commits = createMockCommits(5, {
 *   description: "Custom message"
 * });
 */
export function createMockCommits(
  count: number = 2,
  overrides?: CommitFactoryOptions
): JjLogCommit[] {
  const commits: JjLogCommit[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(2024, 0, count - i);
    commits.push(
      createMockCommit({
        author_name: `Author ${i + 1}`,
        description: `Commit ${i + 1}`,
        timestamp: timestamp.toISOString().split("T")[0] + " 10:00:00",
        ...overrides,
      })
    );
  }

  return commits;
}
