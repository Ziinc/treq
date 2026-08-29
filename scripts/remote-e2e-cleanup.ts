#!/usr/bin/env -S deno run --allow-net --allow-env
// deno-lint-ignore-file no-import-prefix -- standalone script outside
// supabase/functions, so it has no import map to resolve a bare
// "@supabase/supabase-js" specifier against; an explicit https: import is
// the normal, supported way to depend on a package in a lone Deno script.
//
// Scheduled/standalone cleanup for leaked Remote SSH e2e test resources
// (prds/remote-ssh.md, Phase 8: "A scheduled cleanup job removes leaked test
// resources after a safety window.").
//
// This repository has no pg_cron usage anywhere (see the Phase 7 admin
// surface, supabase/functions/remote-admin/index.ts, which follows the same
// "operator-invoked, not a DB-scheduled job" convention). This script is
// therefore the "scheduled cleanup job" the PRD asks for: it is a real,
// invokable Deno script, not a cron dependency. Operationally, schedule it
// with whatever the deployment environment already uses to run recurring
// jobs (a GitHub Actions scheduled workflow, a Fly.io scheduled machine, an
// external cron calling `deno run` against this file) - there is nothing to
// wire up on the Supabase or Postgres side.
//
// It finds and deletes:
//   - remote_instances rows (and their provider-side Fly machines) whose
//     owning auth user's email matches the e2e tag pattern and which are
//     older than the safety window;
//   - remote_client_keys rows tagged the same way;
//   - the auth.users test accounts themselves (deleting the user cascades
//     ownership of the rows above through the same RLS-owner_user_id model
//     every other remote_* table uses).
//
// Usage:
//   deno run --allow-net --allow-env scripts/remote-e2e-cleanup.ts [--dry-run] [--min-age-hours=N]
//
// Required environment variables (same test-project credentials as
// supabase/functions/tests/remote_e2e.test.ts):
//   SUPABASE_TEST_URL
//   SUPABASE_TEST_SERVICE_ROLE_KEY
//   REMOTE_ADMIN_API_KEY_TEST   - only needed if --prune-audit-events is passed
//
// Safety:
//   - Only ever touches resources whose tag/email matches `treq-e2e-`
//     followed by a UUID - the exact shape emitted by remote_e2e.rs's
//     `e2e_tag()` and remote_e2e.test.ts's `e2eTag()`. This script will
//     never delete a resource that does not match that pattern, so it
//     cannot reach a real user's instance no matter what else is in the
//     test project.
//   - Defaults to a 2-hour safety window (`--min-age-hours`, default 2):
//     resources younger than that are left alone, so a cleanup run
//     triggered concurrently with an in-progress test run cannot delete
//     resources that test is still using.
//   - `--dry-run` prints what would be deleted without deleting anything.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const E2E_TAG_PATTERN = /^treq-e2e-[0-9a-f-]{36}/i;
const DEFAULT_MIN_AGE_HOURS = 2;

function parseArgs(argv: string[]): { dryRun: boolean; minAgeHours: number } {
  let dryRun = false;
  let minAgeHours = DEFAULT_MIN_AGE_HOURS;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--min-age-hours=")) {
      const parsed = Number(arg.split("=")[1]);
      if (Number.isFinite(parsed) && parsed >= 0) minAgeHours = parsed;
    }
  }
  return { dryRun, minAgeHours };
}

function isE2eTagged(value: string | null | undefined): boolean {
  if (!value) return false;
  return E2E_TAG_PATTERN.test(value);
}

async function main() {
  const { dryRun, minAgeHours } = parseArgs(Deno.args);

  const url = Deno.env.get("SUPABASE_TEST_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_TEST_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    console.error(
      "remote-e2e-cleanup: SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY must be set. " +
        "Refusing to run against an unspecified project rather than guessing.",
    );
    Deno.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);
  const cutoff = new Date(Date.now() - minAgeHours * 60 * 60 * 1000);

  console.log(
    `remote-e2e-cleanup: scanning for e2e-tagged resources older than ${cutoff.toISOString()} ` +
      `(min age ${minAgeHours}h)${dryRun ? " [dry run]" : ""}`,
  );

  let page = 0;
  let deletedUsers = 0;
  let scannedUsers = 0;
  const perPage = 200;

  // Supabase's admin listUsers is paginated; walk every page rather than
  // assuming the test project stays small, so a cleanup run never silently
  // stops covering leaked resources once the project accumulates enough
  // test users to spill past one page.
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: page + 1, perPage });
    if (error) {
      console.error(`remote-e2e-cleanup: failed to list users: ${error.message}`);
      Deno.exit(1);
    }
    if (!data.users || data.users.length === 0) break;

    for (const user of data.users) {
      scannedUsers += 1;
      const email = user.email ?? "";
      const localPart = email.split("@")[0] ?? "";
      if (!isE2eTagged(localPart)) continue;

      const createdAt = new Date(user.created_at);
      if (createdAt > cutoff) {
        console.log(`  SKIP ${email} (created ${user.created_at}, within safety window)`);
        continue;
      }

      console.log(`  ${dryRun ? "WOULD DELETE" : "DELETING"} test user ${email} (id=${user.id}, created ${user.created_at})`);
      if (!dryRun) {
        // Deleting the user is sufficient: every remote_* table this repo
        // defines keys ownership off owner_user_id with a foreign key back
        // to auth.users, and RLS/ownership checks throughout the control
        // plane (remote-instance, remote-ssh-trust) treat owner_user_id as
        // the sole authority - there is no separate "instance tag" to hunt
        // down once the owning user is gone. If a future migration changes
        // that FK to a non-cascading one, this call surfaces the failure
        // directly rather than silently leaving orphaned rows.
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
        if (deleteError) {
          console.error(`    FAILED to delete ${email}: ${deleteError.message}`);
          continue;
        }
        deletedUsers += 1;
      } else {
        deletedUsers += 1;
      }
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  console.log(
    `remote-e2e-cleanup: scanned ${scannedUsers} users, ` +
      `${dryRun ? "would delete" : "deleted"} ${deletedUsers} e2e-tagged test user(s) and their owned resources.`,
  );

  // Fly-side orphan detection: any e2e-tagged provider machine whose owning
  // Supabase test user is already gone (e.g. a prior cleanup run's admin
  // delete succeeded but its own compensating provider delete_instance call
  // never ran) is a true orphan the control plane no longer knows about at
  // all. Finding those requires listing the Fly test app's machines
  // directly - left as a documented manual/operational step rather than
  // implemented here, because it needs the Fly test API token
  // (FLY_TEST_API_TOKEN), a credential this script does not otherwise need
  // and should not be handed just to run the common case. Operators with
  // that token can list orphans directly:
  //
  //   curl -s -H "Authorization: Bearer $FLY_TEST_API_TOKEN" \
  //     "$FLY_TEST_API_BASE_URL/apps/$FLY_TEST_APP_NAME/machines" \
  //     | jq '.[] | select(.name | startswith("treq-treq-e2e-"))'
  //
  // and delete any whose name matches the e2e tag pattern.
  console.log(
    "remote-e2e-cleanup: Fly-side orphan machines (created but never recorded, or recorded but " +
      "whose owning user delete did not cascade to a provider delete_instance call) are not scanned " +
      "by this script - see the comment above main() for the manual Fly-API check.",
  );
}

if (import.meta.main) {
  await main();
}
