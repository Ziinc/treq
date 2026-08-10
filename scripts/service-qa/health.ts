/**
 * Fail fast when the local Supabase CLI stack is not reachable.
 */
import {
  LOCAL_ANON_KEY,
  LOCAL_SUPABASE_URL,
  resolveLocalKeys,
} from "./clients";

const HEALTH_TIMEOUT_MS = 5_000;

export async function assertLocalSupabaseUp(): Promise<void> {
  const { url, anonKey } = (() => {
    try {
      return resolveLocalKeys();
    } catch {
      return { url: LOCAL_SUPABASE_URL, anonKey: LOCAL_ANON_KEY };
    }
  })();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Local Supabase is not reachable at ${url} (${reason}). ` +
        `Start it with \`npm run service-qa:up\` (or \`make start && make db.reset\`), ` +
        `then re-run service-qa. See .claude/skills/service-qa/SKILL.md.`,
    );
  } finally {
    clearTimeout(timer);
  }

  // PostgREST returns 200 on /rest/v1/ with an OpenAPI doc when healthy.
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Local Supabase at ${url} responded HTTP ${response.status}. ` +
        `Run \`npm run service-qa:up\` and check \`supabase status\`.`,
    );
  }
}
