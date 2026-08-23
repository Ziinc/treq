export interface TreeEntry {
  name: string;
  path: string;
  is_directory: boolean;
}

export function flattenExpandedTree<T extends TreeEntry>(
  roots: T[],
  expanded: Set<string>,
  cache: Map<string, T[]>,
): Array<{ entry: T; depth: number }> {
  const rows: Array<{ entry: T; depth: number }> = [];
  const append = (entries: T[], depth: number) => {
    const sorted = [...entries].sort((a, b) =>
      a.is_directory === b.is_directory
        ? a.name.localeCompare(b.name)
        : a.is_directory ? -1 : 1,
    );
    for (const entry of sorted) {
      rows.push({ entry, depth });
      if (entry.is_directory && expanded.has(entry.path)) {
        append(cache.get(entry.path) ?? [], depth + 1);
      }
    }
  };
  append(roots, 0);
  return rows;
}
