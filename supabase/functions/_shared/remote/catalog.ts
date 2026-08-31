// Closed sets of region codes and size presets offered to users, mirroring
// `core::remote_provider::REGIONS` / `SIZE_PRESETS` in src-tauri. Keeping
// these as a literal list (rather than reading them from the provider) means
// an Edge Function can validate a request before ever calling the vendor.

export const REGION_CODES = ["us_east", "us_west", "eu_west", "ap_southeast"] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export const SIZE_PRESETS = ["small", "medium", "large"] as const;
export type SizePreset = (typeof SIZE_PRESETS)[number];

export function isRegionCode(value: unknown): value is RegionCode {
  return typeof value === "string" && (REGION_CODES as readonly string[]).includes(value);
}

export function isSizePreset(value: unknown): value is SizePreset {
  return typeof value === "string" && (SIZE_PRESETS as readonly string[]).includes(value);
}

// PRD "Resource quotas" / Goal 3: every user's managed instance starts at
// (and, in this delivery, is capped at) a fixed base allocation included in
// the plan - 5 GB disk, 1 vCPU, 2 GB RAM. `small` is defined to be exactly
// that base allocation; purchasing additional disk or compute as a plan
// add-on is explicitly deferred (PRD Non-goals), so `medium`/`large` are not
// selectable yet. Mirrors `core::remote_provider::BASE_ALLOCATION` in
// src-tauri.
export const BASE_ALLOCATION = {
  preset: "small" as SizePreset,
  vcpu: 1,
  ramGb: 2,
  diskGb: 5,
} as const;

export const BASE_DISK_QUOTA_BYTES = BASE_ALLOCATION.diskGb * 1024 * 1024 * 1024;

// True only for the size preset that is within the base allocation this
// delivery enforces. Everything else would require a plan add-on that does
// not exist yet.
export function isBaseAllocationPreset(preset: SizePreset): boolean {
  return preset === BASE_ALLOCATION.preset;
}

// Fly region slugs, matching `SpritesProvider::region_slug` in
// src-tauri/src/core/remote_provider_sprites.rs. Kept in one place so the
// mapping cannot drift between the Rust adapter and this Edge Function.
export const REGION_TO_FLY_SLUG: Record<RegionCode, string> = {
  us_east: "iad",
  us_west: "sjc",
  eu_west: "lhr",
  ap_southeast: "sin",
};
