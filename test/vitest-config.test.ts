import { describe, expect, it } from "vitest";
import {
  VITEST_PROJECT_DEFINITIONS,
  assertUniqueGroupOrderPerMaxWorkers,
} from "../vitest.projects";

describe("vitest project sequence", () => {
  it("assigns a unique groupOrder for each distinct maxWorkers value", () => {
    expect(() =>
      assertUniqueGroupOrderPerMaxWorkers(VITEST_PROJECT_DEFINITIONS),
    ).not.toThrow();
  });

  it("rejects the pre-fix layout where unit and integration-parallel shared groupOrder 0", () => {
    const legacyLayout = [
      { name: "unit", groupOrder: 0, maxWorkers: 7 },
      { name: "integration-parallel", groupOrder: 0, maxWorkers: 3 },
    ];
    expect(() => assertUniqueGroupOrderPerMaxWorkers(legacyLayout)).toThrow(
      /same 'sequence\.groupOrder'/,
    );
  });
});
