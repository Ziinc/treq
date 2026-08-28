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

// Fly region slugs, matching `SpritesProvider::region_slug` in
// src-tauri/src/core/remote_provider_sprites.rs. Kept in one place so the
// mapping cannot drift between the Rust adapter and this Edge Function.
export const REGION_TO_FLY_SLUG: Record<RegionCode, string> = {
  us_east: "iad",
  us_west: "sjc",
  eu_west: "lhr",
  ap_southeast: "sin",
};
