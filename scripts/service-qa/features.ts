/**
 * Feature flags for service-qa. Overrides package.json so email/password
 * signup+login is always available in this harness, even when the product
 * flag `emailSignup` is off for the shipped app/web UI.
 */
import pkg from "../../package.json";

export const FEATURES = {
  ...pkg.featureFlags,
  /** service-qa always exercises Auth email/password, never OAuth. */
  emailSignup: true,
} as const;

if (!FEATURES.emailSignup) {
  throw new Error(
    "service-qa requires FEATURES.emailSignup=true (email/password logins).",
  );
}
