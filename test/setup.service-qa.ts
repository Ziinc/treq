/**
 * service-qa setup: require a live local Supabase CLI stack before any spec runs.
 */
import { beforeAll } from "vitest";
import { assertLocalSupabaseUp } from "../scripts/service-qa/health";

beforeAll(async () => {
  await assertLocalSupabaseUp();
}, 30_000);
