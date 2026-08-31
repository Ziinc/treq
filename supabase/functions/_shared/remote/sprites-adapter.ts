// Fly Sprites provider adapter for the control plane, mirroring
// `core::remote_provider_sprites::SpritesProvider` in src-tauri. This is the
// Deno-side equivalent used by Edge Functions: same vendor API shape, same
// state normalization, same idempotency-header convention. Vendor status
// strings and vendor SDK types must never leave this module.

import type { RegionCode, SizePreset } from "./catalog.ts";
import { BASE_ALLOCATION, REGION_TO_FLY_SLUG } from "./catalog.ts";
import { bootstrapCommand } from "./boot-manifest.ts";

export type ManagedInstanceState =
  | "unprovisioned"
  | "provisioning"
  | "bootstrapping"
  | "installing_access"
  | "verifying"
  | "ready"
  | "suspended"
  | "waking"
  | "reprovisioning"
  | "degraded"
  | "failed"
  | "deleting"
  | "deleted";

export interface ProviderInstance {
  providerResourceId: string;
  state: ManagedInstanceState;
  region: RegionCode;
  sizePreset: SizePreset;
  address: string | null;
}

export class ProviderError extends Error {
  constructor(
    public readonly kind:
      | "not_found"
      | "already_exists"
      | "quota_exceeded"
      | "invalid_request"
      | "unavailable"
      | "timeout"
      | "other",
    message: string,
  ) {
    super(message);
  }
}

export interface CreateInstanceParams {
  ownerUserId: string;
  region: RegionCode;
  sizePreset: SizePreset;
  manifestVersion: number;
  idempotencyKey: string;
}

export interface ReplaceInstanceParams {
  providerResourceId: string;
  region: RegionCode;
  sizePreset: SizePreset;
  manifestVersion: number;
  idempotencyKey: string;
}

export interface MachineExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ManagedComputeProvider {
  createInstance(params: CreateInstanceParams): Promise<ProviderInstance>;
  getInstance(providerId: string): Promise<ProviderInstance>;
  wakeInstance(providerId: string): Promise<void>;
  replaceInstance(params: ReplaceInstanceParams): Promise<ProviderInstance>;
  deleteInstance(providerId: string): Promise<void>;
  // Runs a command inside a running machine (Fly Machines `/exec`), used to
  // install CA trust and authorized_keys onto an already-booted managed VM.
  execOnMachine(providerId: string, command: string[], timeoutSeconds?: number): Promise<MachineExecResult>;
}

// PRD "Resource quotas": every user's managed instance is enforced at the
// fixed base allocation (5 GB disk / 1 vCPU / 2 GB RAM) at provisioning
// time, regardless of `preset` - purchasing more as a plan add-on is
// explicitly out of scope for this delivery, so the vendor request never
// asks for more than the base allocation. `remote-instance/index.ts`
// rejects a non-base `size_preset` before this is ever called, but this
// stays unconditional so the guest spec sent to the vendor can never exceed
// the quota even if a caller is added later that skips that guard.
function sizeToGuest(_preset: SizePreset) {
  return {
    cpu_kind: "shared",
    cpus: BASE_ALLOCATION.vcpu,
    memory_mb: BASE_ALLOCATION.ramGb * 1024,
  };
}

// Disk allocation requested alongside the guest spec: a persistent volume
// sized to exactly the base disk quota. Kept in its own helper (rather than
// folded into `sizeToGuest`) because Fly Machines expresses disk as a
// separate `volumes` attachment, not part of `guest`.
function baseVolumeSizeGb(): number {
  return BASE_ALLOCATION.diskGb;
}

function guestToSize(memoryMb: number): SizePreset {
  if (memoryMb <= 2048) return "small";
  if (memoryMb <= 4096) return "medium";
  return "large";
}

const SLUG_TO_REGION: Record<string, RegionCode> = Object.fromEntries(
  Object.entries(REGION_TO_FLY_SLUG).map(([region, slug]) => [slug, region as RegionCode]),
);

function normalizeState(vendorState: string): ManagedInstanceState {
  switch (vendorState) {
    case "created":
    case "starting":
      return "provisioning";
    case "started":
      return "ready";
    case "stopping":
    case "stopped":
    case "suspended":
      return "suspended";
    case "replacing":
      return "reprovisioning";
    case "destroying":
      return "deleting";
    case "destroyed":
      return "deleted";
    default:
      return "degraded";
  }
}

// deno-lint-ignore no-explicit-any
function normalizeInstance(machine: any): ProviderInstance {
  return {
    providerResourceId: machine.id,
    state: normalizeState(machine.state),
    region: SLUG_TO_REGION[machine.region] ?? "us_east",
    sizePreset: guestToSize(machine.config?.guest?.memory_mb ?? 2048),
    address: machine.private_ip ?? null,
  };
}

const SPRITES_BASE_IMAGE = "registry.fly.io/treq-remote-base:latest";

export interface SpritesConfig {
  baseUrl: string;
  apiToken: string;
  appName: string;
}

/// Reads Fly Sprites configuration from Edge Function secrets. Never logged;
/// never returned to a client.
export function spritesConfigFromEnv(): SpritesConfig {
  const baseUrl = Deno.env.get("FLY_SPRITES_API_BASE_URL");
  const apiToken = Deno.env.get("FLY_SPRITES_API_TOKEN");
  const appName = Deno.env.get("FLY_SPRITES_APP_NAME");
  if (!baseUrl || !apiToken || !appName) {
    throw new ProviderError(
      "invalid_request",
      "FLY_SPRITES_API_BASE_URL, FLY_SPRITES_API_TOKEN, and FLY_SPRITES_APP_NAME must be set",
    );
  }
  return { baseUrl, apiToken, appName };
}

export class SpritesProvider implements ManagedComputeProvider {
  constructor(private readonly config: SpritesConfig) {}

  private machinesUrl(): string {
    return `${this.config.baseUrl.replace(/\/+$/, "")}/apps/${this.config.appName}/machines`;
  }

  private machineUrl(id: string): string {
    return `${this.machinesUrl()}/${id}`;
  }

  // Runs a command inside a running machine via the Fly Machines `/exec`
  // endpoint. This is how server-side config (CA trust, authorized_keys) is
  // pushed onto an already-booted managed VM without a native SSH client -
  // the same mechanism `init.exec` uses at boot, just invoked after the fact.
  async execOnMachine(providerId: string, command: string[], timeoutSeconds = 20): Promise<MachineExecResult> {
    let response: Response;
    try {
      response = await fetch(`${this.machineUrl(providerId)}/exec`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ cmd: command, timeout: timeoutSeconds }),
      });
    } catch (err) {
      throw new ProviderError("unavailable", `could not reach Fly Machines API: ${(err as Error).message}`);
    }
    if (!response.ok) throw await this.mapErrorResponse(response);
    const body = await response.json();
    return {
      exitCode: typeof body.exit_code === "number" ? body.exit_code : -1,
      stdout: typeof body.stdout === "string" ? body.stdout : "",
      stderr: typeof body.stderr === "string" ? body.stderr : "",
    };
  }

  private headers(idempotencyKey?: string): HeadersInit {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiToken}`,
      "Content-Type": "application/json",
    };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
      headers["Fly-Idempotency-Key"] = idempotencyKey;
    }
    return headers;
  }

  private async mapErrorResponse(response: Response): Promise<ProviderError> {
    const text = await response.text().catch(() => "");
    const truncated = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    switch (response.status) {
      case 404:
        return new ProviderError("not_found", "instance not found");
      case 409:
        return new ProviderError("already_exists", "instance already exists");
      case 429:
        return new ProviderError("quota_exceeded", "provider quota exceeded");
      case 400:
      case 422:
        return new ProviderError("invalid_request", truncated);
      default:
        if (response.status >= 500) return new ProviderError("unavailable", truncated);
        return new ProviderError("other", truncated);
    }
  }

  async createInstance(params: CreateInstanceParams): Promise<ProviderInstance> {
    const body = {
      name: `treq-${params.ownerUserId}`,
      region: REGION_TO_FLY_SLUG[params.region],
      config: {
        image: SPRITES_BASE_IMAGE,
        guest: sizeToGuest(params.sizePreset),
        // Disk allocation is capped at the base quota (PRD "Resource
        // quotas"); see `baseVolumeSizeGb`.
        mounts: [{ path: "/home/treq", size_gb: baseVolumeSizeGb() }],
        env: { TREQ_BOOT_MANIFEST_VERSION: String(params.manifestVersion) },
        init: { exec: bootstrapCommand(params.manifestVersion) },
      },
    };

    let response: Response;
    try {
      response = await fetch(this.machinesUrl(), {
        method: "POST",
        headers: this.headers(params.idempotencyKey),
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError("unavailable", `could not reach Fly Machines API: ${(err as Error).message}`);
    }

    if (response.status === 409) {
      // A repeated create with the same idempotency key/machine name: treat
      // the vendor's existing-resource response as success rather than an
      // error, so create stays idempotent for the caller.
      const machine = await response.json().catch(() => null);
      if (machine) return normalizeInstance(machine);
      throw new ProviderError("already_exists", "instance already exists");
    }
    if (!response.ok) throw await this.mapErrorResponse(response);
    return normalizeInstance(await response.json());
  }

  async getInstance(providerId: string): Promise<ProviderInstance> {
    let response: Response;
    try {
      response = await fetch(this.machineUrl(providerId), { headers: this.headers() });
    } catch (err) {
      throw new ProviderError("unavailable", `could not reach Fly Machines API: ${(err as Error).message}`);
    }
    if (!response.ok) throw await this.mapErrorResponse(response);
    return normalizeInstance(await response.json());
  }

  async wakeInstance(providerId: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.machineUrl(providerId)}/start`, {
        method: "POST",
        headers: this.headers(),
      });
    } catch (err) {
      throw new ProviderError("unavailable", `could not reach Fly Machines API: ${(err as Error).message}`);
    }
    if (response.ok) return;
    const text = await response.text().catch(() => "");
    if (response.status === 400 && text.toLowerCase().includes("already")) return;
    throw await this.mapErrorResponse(new Response(text, { status: response.status }));
  }

  async replaceInstance(params: ReplaceInstanceParams): Promise<ProviderInstance> {
    const body = {
      image: SPRITES_BASE_IMAGE,
      guest: sizeToGuest(params.sizePreset),
      mounts: [{ path: "/home/treq", size_gb: baseVolumeSizeGb() }],
      env: { TREQ_BOOT_MANIFEST_VERSION: String(params.manifestVersion) },
      init: { exec: bootstrapCommand(params.manifestVersion) },
    };
    let response: Response;
    try {
      response = await fetch(`${this.machineUrl(params.providerResourceId)}/update`, {
        method: "POST",
        headers: this.headers(params.idempotencyKey),
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError("unavailable", `could not reach Fly Machines API: ${(err as Error).message}`);
    }
    if (!response.ok) throw await this.mapErrorResponse(response);
    return normalizeInstance(await response.json());
  }

  async deleteInstance(providerId: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.machineUrl(providerId)}?force=true`, {
        method: "DELETE",
        headers: this.headers(),
      });
    } catch (err) {
      throw new ProviderError("unavailable", `could not reach Fly Machines API: ${(err as Error).message}`);
    }
    if (response.ok || response.status === 404) return;
    throw await this.mapErrorResponse(response);
  }
}
