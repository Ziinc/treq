import type { JjFileChange } from "../../src/lib/api";

interface FileFactoryOptions extends Partial<JjFileChange> {}

/**
 * Factory function to create mock file change objects
 *
 * @example
 * // Generate default mock file
 * const file = createMockFile();
 *
 * // Override specific values
 * const modifiedFile = createMockFile({
 *   path: "src/index.ts",
 *   status: "M"
 * });
 */
export function createMockFile(overrides?: FileFactoryOptions): JjFileChange {
  const randomId = Math.random().toString(36).substring(2, 7);

  return {
    path: `src/file${randomId}.ts`,
    status: "M",
    previous_path: null,
    ...overrides,
  };
}

/**
 * Factory function to create an array of mock file changes
 * Useful for testing file lists
 *
 * @example
 * // Create 3 files with default values
 * const files = createMockFiles(3);
 *
 * // Create 5 files with custom status
 * const files = createMockFiles(5, { status: "A" });
 */
export function createMockFiles(
  count: number = 2,
  overrides?: FileFactoryOptions
): JjFileChange[] {
  const files: JjFileChange[] = [];

  for (let i = 0; i < count; i++) {
    files.push(
      createMockFile({
        path: `src/file${i + 1}.ts`,
        ...overrides,
      })
    );
  }

  return files;
}
