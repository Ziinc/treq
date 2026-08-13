import { describe, expect, it } from "vitest";

/**
 * Mirror of the Rust evaluate_update / is_newer_version contract so the
 * frontend toast copy stays aligned with backend version comparison.
 */
function parseSemver(version: string): [number, number, number] | null {
  const trimmed = version.trim().replace(/^v/, "");
  const parts = trimmed.split(".");
  if (parts.length !== 3) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return nums as [number, number, number];
}

function isNewerVersion(current: string, latest: string): boolean {
  const a = parseSemver(current);
  const b = parseSemver(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true;
    if (b[i] < a[i]) return false;
  }
  return false;
}

describe("auto-update version compare", () => {
  it("detects newer patch/minor/major", () => {
    expect(isNewerVersion("0.1.3", "0.1.4")).toBe(true);
    expect(isNewerVersion("0.1.3", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.9.9", "1.0.0")).toBe(true);
  });

  it("rejects equal or older versions", () => {
    expect(isNewerVersion("0.1.3", "0.1.3")).toBe(false);
    expect(isNewerVersion("0.1.4", "0.1.3")).toBe(false);
  });
});
