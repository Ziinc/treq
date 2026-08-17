/**
 * Hash route for the historical `treq send` artifacts gallery.
 * Same constraint as GitHub routes: do not put query strings in the hash.
 */

export const ARTIFACTS_BASE_PATH = "/artifacts";

export function artifactsPath(): string {
  return ARTIFACTS_BASE_PATH;
}
