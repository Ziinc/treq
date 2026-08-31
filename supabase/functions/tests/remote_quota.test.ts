// Local, non-network unit tests for the base resource quota (5 GB disk /
// 1 vCPU / 2 GB RAM) enforced by the Remote SSH control plane
// (prds/remote-ssh.md, "Instance lifecycle" > "Resource quotas").
//
// Unlike remote_e2e.test.ts, this suite never talks to a Supabase project
// or the Fly Sprites API - it exercises the pure catalog/adapter logic that
// decides what allocation is requested and validated, so it always runs
// (no TREQ_REMOTE_E2E gate, no network permissions needed).
//
// Run with: `deno test --allow-env supabase/functions/tests/remote_quota.test.ts`

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BASE_ALLOCATION,
  BASE_DISK_QUOTA_BYTES,
  isBaseAllocationPreset,
  type SizePreset,
} from "../_shared/remote/catalog.ts";

Deno.test("base allocation matches the PRD fixed quota", () => {
  assertEquals(BASE_ALLOCATION.preset, "small");
  assertEquals(BASE_ALLOCATION.vcpu, 1);
  assertEquals(BASE_ALLOCATION.ramGb, 2);
  assertEquals(BASE_ALLOCATION.diskGb, 5);
  assertEquals(BASE_DISK_QUOTA_BYTES, 5 * 1024 * 1024 * 1024);
});

Deno.test("only the small preset is within the base allocation", () => {
  assert(isBaseAllocationPreset("small"));
  assertFalse(isBaseAllocationPreset("medium" as SizePreset));
  assertFalse(isBaseAllocationPreset("large" as SizePreset));
});

// Provisioning must always request exactly the base allocation from the
// vendor, regardless of which preset was selected - add-on purchase does
// not exist yet, so nothing above base can ever leave this process bound
// for the provider. Exercised by intercepting the outgoing `fetch` call the
// adapter makes to the Fly Machines API and inspecting the request body it
// actually sent.
Deno.test("sprites adapter always requests the base allocation guest spec, regardless of preset", async () => {
  const { SpritesProvider } = await import("../_shared/remote/sprites-adapter.ts");
  const originalFetch = globalThis.fetch;
  const capturedBodies: unknown[] = [];
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBodies.push(JSON.parse(init?.body as string));
    return Promise.resolve(
      new Response(
        JSON.stringify({
          id: "test-machine",
          state: "started",
          region: "iad",
          private_ip: "fdaa::1",
          config: { guest: { memory_mb: 2048 } },
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;

  try {
    const provider = new SpritesProvider({
      baseUrl: "https://example.invalid",
      apiToken: "test-token",
      appName: "treq-test",
    });

    for (const sizePreset of ["small", "medium", "large"] as SizePreset[]) {
      await provider.createInstance({
        ownerUserId: "user-1",
        region: "us_east",
        sizePreset,
        manifestVersion: 1,
        idempotencyKey: `idem-${sizePreset}`,
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assertEquals(capturedBodies.length, 3);
  for (const body of capturedBodies) {
    // deno-lint-ignore no-explicit-any
    const guest = (body as any).config.guest;
    assertEquals(guest.cpus, BASE_ALLOCATION.vcpu);
    assertEquals(guest.memory_mb, BASE_ALLOCATION.ramGb * 1024);
    // deno-lint-ignore no-explicit-any
    const mounts = (body as any).config.mounts;
    assertEquals(mounts[0].size_gb, BASE_ALLOCATION.diskGb);
  }
});
