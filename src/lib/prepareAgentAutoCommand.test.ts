import { describe, expect, it } from "vitest";
import { parseJsonObject } from "./prepareAgentAutoCommand";

describe("parseJsonObject", () => {
  it("returns a plain object from JSON", () => {
    expect(parseJsonObject('{"permissions":{"allow":["Bash"]}}')).toEqual({
      permissions: { allow: ["Bash"] },
    });
  });

  it("returns null for invalid JSON, arrays, and primitives", () => {
    expect(parseJsonObject("not json")).toBeNull();
    expect(parseJsonObject("[1]")).toBeNull();
    expect(parseJsonObject('"x"')).toBeNull();
  });
});
