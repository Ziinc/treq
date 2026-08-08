import { expect, test } from "@playwright/test";
import { getAuthCallbackUrl } from "../src/lib/utils";

test("uses the configured site URL for production auth callbacks", () => {
  expect(
    getAuthCallbackUrl({
      siteUrl: "https://treq.dev",
      browserOrigin: "http://localhost:3000",
      isProduction: true,
      query: "source=desktop",
    }),
  ).toBe("https://treq.dev/auth/callback?source=desktop");
});

test("uses the browser origin while developing locally", () => {
  expect(
    getAuthCallbackUrl({
      siteUrl: "https://treq.dev",
      browserOrigin: "http://localhost:3001",
      isProduction: false,
      query: "type=recovery",
    }),
  ).toBe("http://localhost:3001/auth/callback?type=recovery");
});
