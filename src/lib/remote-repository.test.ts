import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import type { RepositoryInspection } from "./api-types-remote";
import {
  canonicalizeRemotePath,
  clearLastOpenedRemoteRepository,
  invalidateTrustAfterGenerationChange,
  isSecretFreeDescriptor,
  listRemoteRecentRepositoryIds,
  listSavedRepositoriesForEndpoint,
  rememberLastOpenedRemoteRepository,
  restoreSavedRemoteRepository,
  upsertSavedRemoteRepository,
} from "./remote-repository";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    getSetting: vi.fn(),
    setSetting: vi.fn(),
  };
});

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.mocked(api.getSetting).mockImplementation(async (key) => store.get(key) ?? null);
  vi.mocked(api.setSetting).mockImplementation(async (key, value) => {
    store.set(key, value);
  });
});

function inspection(root: string): RepositoryInspection {
  return {
    root,
    repository_type: "jj_colocated",
    current_branch: "main",
    default_branch: "main",
    current_change_id: "c",
    current_commit_id: "d",
    descriptor: {
      id: "x",
      location: { type: "ssh", host: "box", path: root },
      display_name: root,
    },
  };
}

describe("canonicalizeRemotePath", () => {
  it("collapses slashes, dots, and trailing separators", () => {
    expect(canonicalizeRemotePath(" /srv//project/./app/ ")).toBe(
      "/srv/project/app",
    );
    expect(canonicalizeRemotePath("~/src/../src/app")).toBe("~/src/app");
  });
});

describe("remote repository registry", () => {
  it("stores two repositories on one endpoint generation", async () => {
    await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 3,
      remote_path: "/srv/alpha",
    });
    await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 3,
      remote_path: "/srv/beta",
    });

    const listed = await listSavedRepositoriesForEndpoint("ep-1", 3);
    expect(listed.map((repo) => repo.canonical_remote_path).sort()).toEqual([
      "/srv/alpha",
      "/srv/beta",
    ]);
  });

  it("deduplicates the same canonical path on one endpoint generation", async () => {
    const first = await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 1,
      remote_path: "/srv/project/",
    });
    const second = await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 1,
      remote_path: "/srv/project",
    });

    expect(second.id).toBe(first.id);
    expect(await listSavedRepositoriesForEndpoint("ep-1", 1)).toHaveLength(1);
  });

  it("isolates the same path across endpoint generations", async () => {
    await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 1,
      remote_path: "/srv/project",
    });
    await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 2,
      remote_path: "/srv/project",
    });

    expect(await listSavedRepositoriesForEndpoint("ep-1", 1)).toHaveLength(1);
    expect(await listSavedRepositoriesForEndpoint("ep-1", 2)).toHaveLength(1);
  });

  it("never persists credentials or private keys on descriptors", async () => {
    const record = await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 1,
      remote_path: "/srv/project",
      display_name: "project",
    });

    expect(isSecretFreeDescriptor(record)).toBe(true);
    const persisted = store.get("remote_saved_repositories") ?? "";
    expect(persisted.toLowerCase()).not.toMatch(
      /private_key|password|passphrase|credential|BEGIN OPENSSH/i,
    );
    expect(JSON.parse(persisted)[0]).toEqual(
      expect.objectContaining({
        endpoint_id: "ep-1",
        endpoint_generation: 1,
        canonical_remote_path: "/srv/project",
      }),
    );
    expect(JSON.parse(persisted)[0].auth_identity_reference).toBeUndefined();
    expect(JSON.parse(persisted)[0].private_key).toBeUndefined();
  });

  it("keeps remote recents on a distinct settings key from local last-opened", async () => {
    const record = await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 1,
      remote_path: "/srv/project",
    });
    await rememberLastOpenedRemoteRepository(record.id);

    expect(store.get("last_opened_repo_path")).toBeUndefined();
    expect(store.get("last_opened_remote_repo_id")).toBe(record.id);
    expect(await listRemoteRecentRepositoryIds()).toEqual([record.id]);
  });
});

describe("restoreSavedRemoteRepository", () => {
  it("restores only after reconnect, host-key, generation, and inspect succeed", async () => {
    const descriptor = await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 4,
      remote_path: "/srv/project",
    });
    const order: string[] = [];

    const result = await restoreSavedRemoteRepository({
      descriptor,
      currentGeneration: 4,
      explicitGenerationTransition: false,
      reconnect: async () => {
        order.push("reconnect");
        return true;
      },
      validateHostKey: async () => {
        order.push("host_key");
        return true;
      },
      inspect: async (path) => {
        order.push("inspect");
        return inspection(path);
      },
    });

    expect(order).toEqual(["reconnect", "host_key", "inspect"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.descriptor.last_successful_trust_validation).toBeTruthy();
    }
  });

  it("keeps the repository closed after a failed reconnect", async () => {
    const descriptor = await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 1,
      remote_path: "/srv/project",
    });
    const inspect = vi.fn();

    const result = await restoreSavedRemoteRepository({
      descriptor,
      currentGeneration: 1,
      explicitGenerationTransition: false,
      reconnect: async () => false,
      validateHostKey: async () => true,
      inspect,
    });

    expect(result).toEqual({ ok: false, reason: "reconnect_failed" });
    expect(inspect).not.toHaveBeenCalled();
  });

  it("refuses restore on host-key mismatch without inspecting", async () => {
    const descriptor = await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 1,
      remote_path: "/srv/project",
    });
    const inspect = vi.fn();

    const result = await restoreSavedRemoteRepository({
      descriptor,
      currentGeneration: 1,
      explicitGenerationTransition: false,
      reconnect: async () => true,
      validateHostKey: async () => false,
      inspect,
    });

    expect(result).toEqual({ ok: false, reason: "host_key_mismatch" });
    expect(inspect).not.toHaveBeenCalled();
  });

  it("refuses restore and invalidates trust after a generation change", async () => {
    const descriptor = await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 1,
      remote_path: "/srv/project",
      last_successful_trust_validation: "2026-01-01T00:00:00.000Z",
    });
    const inspect = vi.fn();

    const result = await restoreSavedRemoteRepository({
      descriptor,
      currentGeneration: 2,
      explicitGenerationTransition: false,
      reconnect: async () => true,
      validateHostKey: async () => true,
      inspect,
    });

    expect(result).toEqual({ ok: false, reason: "generation_mismatch" });
    expect(inspect).not.toHaveBeenCalled();
    const [stale] = await listSavedRepositoriesForEndpoint("ep-1", 1);
    expect(stale.last_successful_trust_validation).toBeNull();
  });

  it("accepts an explicit generation transition then records the new generation", async () => {
    const descriptor = await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 1,
      remote_path: "/srv/project",
    });

    const result = await restoreSavedRemoteRepository({
      descriptor,
      currentGeneration: 2,
      explicitGenerationTransition: true,
      reconnect: async () => true,
      validateHostKey: async () => true,
      inspect: async (path) => inspection(path),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.descriptor.endpoint_generation).toBe(2);
    }
  });
});

describe("invalidateTrustAfterGenerationChange", () => {
  it("clears last successful validation for the previous generation only", async () => {
    await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 1,
      remote_path: "/srv/a",
      last_successful_trust_validation: "2026-01-01T00:00:00.000Z",
    });
    await upsertSavedRemoteRepository({
      endpoint_id: "ep-1",
      endpoint_generation: 2,
      remote_path: "/srv/a",
      last_successful_trust_validation: "2026-02-01T00:00:00.000Z",
    });

    await invalidateTrustAfterGenerationChange("ep-1", 1);

    expect(
      (await listSavedRepositoriesForEndpoint("ep-1", 1))[0]
        .last_successful_trust_validation,
    ).toBeNull();
    expect(
      (await listSavedRepositoriesForEndpoint("ep-1", 2))[0]
        .last_successful_trust_validation,
    ).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("clearLastOpenedRemoteRepository", () => {
  it("does not clear the local last-opened path", async () => {
    store.set("last_opened_repo_path", "/local/repo");
    await rememberLastOpenedRemoteRepository("remote-1");
    await clearLastOpenedRemoteRepository();
    expect(store.get("last_opened_repo_path")).toBe("/local/repo");
    expect(store.get("last_opened_remote_repo_id")).toBe("");
  });
});
