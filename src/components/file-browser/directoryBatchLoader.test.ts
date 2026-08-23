import { describe, expect, it, vi } from "vitest";
import { DirectoryBatchLoader } from "./directoryBatchLoader";

describe("DirectoryBatchLoader", () => {
  it("deduplicates queued paths and caps backend calls at 16", async () => {
    const request = vi.fn(async (paths: string[]) =>
      paths.map((path) => ({ path, entries: [] })),
    );
    const loader = new DirectoryBatchLoader(request);
    const paths = Array.from({ length: 17 }, (_, index) => `dir-${index}`);
    await Promise.all([...paths, paths[0]].map((path) => loader.load(path)));
    expect(request.mock.calls.map(([batch]) => batch.length)).toEqual([16, 1]);
    expect(request.mock.calls.flatMap(([batch]) => batch)).toEqual(paths);
  });

  it("returns an error only to the failed directory", async () => {
    const loader = new DirectoryBatchLoader(async (paths) =>
      paths.map((path) => ({
        path,
        entries: [],
        error: path === "bad" ? "unreadable" : undefined,
      })),
    );
    await expect(loader.load("bad")).rejects.toThrow("unreadable");
    await expect(loader.load("good")).resolves.toEqual([]);
  });
});
