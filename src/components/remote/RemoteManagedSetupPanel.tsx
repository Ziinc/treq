import { useState } from "react";
import { Button } from "../ui/button";
import type {
  InstanceStatusResponse,
  RegionCode,
  SizePreset,
} from "../../lib/api-types-remote";
import {
  REGION_LABELS,
  SIZE_LABELS,
  STAGE_LABELS,
  type LocalKeyIdentity,
} from "./remoteSetupLabels";

export interface RemoteManagedSetupPanelProps {
  regions: RegionCode[];
  sizePresets: SizePreset[];
  localKeyIdentities: LocalKeyIdentity[];
  instanceStatus: InstanceStatusResponse | null;
  provisioningStage?: string;
  provisioningError?: string;
  onBack: () => void;
  onProvisionManaged: (
    region: RegionCode,
    size: SizePreset,
    keyReference: string,
  ) => Promise<void>;
  onWake: () => Promise<void>;
  onReprovision: (region: RegionCode, size: SizePreset) => Promise<void>;
  onDeleteInstance: () => Promise<void>;
  onRevokeKey: (keyReference: string) => Promise<void>;
  onOpenRepositories?: () => void;
}

/** Treq-managed VM setup and lifecycle screen (region/size/identity picker, or lifecycle actions once provisioned). */
export function RemoteManagedSetupPanel({
  regions,
  sizePresets,
  localKeyIdentities,
  instanceStatus,
  provisioningStage,
  provisioningError,
  onBack,
  onProvisionManaged,
  onWake,
  onReprovision,
  onDeleteInstance,
  onRevokeKey,
  onOpenRepositories,
}: RemoteManagedSetupPanelProps) {
  const [region, setRegion] = useState<RegionCode | "">("");
  const [size, setSize] = useState<SizePreset | "">("");
  const [keyReference, setKeyReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmingReprovision, setConfirmingReprovision] = useState(false);

  const existingInstance = instanceStatus?.instance ?? null;
  const existingEndpoint = instanceStatus?.endpoint ?? null;
  const selectedKey = localKeyIdentities.find(
    (identity) => identity.reference === keyReference,
  );

  const handleProvision = async () => {
    if (!region || !size || !keyReference) return;
    setSubmitting(true);
    try {
      await onProvisionManaged(region, size, keyReference);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReprovisionConfirmed = async () => {
    if (!region || !size) return;
    setSubmitting(true);
    try {
      await onReprovision(region, size);
      setConfirmingReprovision(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {existingInstance ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-border/60 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {STAGE_LABELS[existingInstance.status]}
              </span>
              <span className="text-muted-foreground">
                {REGION_LABELS[existingInstance.region]} ·{" "}
                {SIZE_LABELS[existingInstance.size_preset]} · gen{" "}
                {existingInstance.generation}
              </span>
            </div>
            {existingEndpoint && (
              <p className="mt-1 text-muted-foreground">
                {existingEndpoint.username}@{existingEndpoint.hostname}:
                {existingEndpoint.port}
              </p>
            )}
          </div>

          {provisioningError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {provisioningError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {existingEndpoint &&
              existingInstance.status === "ready" &&
              onOpenRepositories && (
                <Button size="sm" onClick={onOpenRepositories}>
                  Open repositories
                </Button>
              )}
            {(existingInstance.status === "suspended" ||
              existingInstance.status === "waking") && (
              <Button
                size="sm"
                disabled={submitting}
                onClick={() => void onWake()}
              >
                Wake
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirmingReprovision(true)}
            >
              Reprovision
            </Button>
            {keyReference && (
              <Button
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => void onRevokeKey(keyReference)}
              >
                Revoke key
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              disabled={submitting}
              onClick={() => void onDeleteInstance()}
            >
              Delete VM
            </Button>
          </div>

          {confirmingReprovision && (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
              <p>
                Reprovisioning replaces this VM and increments its generation.
                Repository preservation depends on the provider&apos;s storage
                behavior - export anything you need first. This does not migrate
                to a different region.
              </p>
              <div className="mt-3 flex gap-2">
                <label className="flex items-center gap-1">
                  Region
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value as RegionCode)}
                    className="rounded border border-border/60 bg-background px-1 py-0.5"
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    {regions.map((code) => (
                      <option key={code} value={code}>
                        {REGION_LABELS[code]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  Size
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value as SizePreset)}
                    className="rounded border border-border/60 bg-background px-1 py-0.5"
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    {sizePresets.map((preset) => (
                      <option key={preset} value={preset}>
                        {SIZE_LABELS[preset]}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  disabled={!region || !size || submitting}
                  onClick={() => void handleReprovisionConfirmed()}
                >
                  Confirm reprovision
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmingReprovision(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Region</span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as RegionCode)}
              className="rounded-md border border-border/60 bg-background px-2 py-1.5"
            >
              <option value="" disabled>
                Choose a region
              </option>
              {regions.map((code) => (
                <option key={code} value={code}>
                  {REGION_LABELS[code]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Size</span>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as SizePreset)}
              className="rounded-md border border-border/60 bg-background px-2 py-1.5"
            >
              <option value="" disabled>
                Choose a size
              </option>
              {sizePresets.map((preset) => (
                <option key={preset} value={preset}>
                  {SIZE_LABELS[preset]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">SSH identity</span>
            {localKeyIdentities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No local SSH key was found. Create or import one outside Treq,
                then reopen this dialog. Treq never generates a private key for
                you.
              </p>
            ) : (
              <select
                value={keyReference}
                onChange={(e) => setKeyReference(e.target.value)}
                className="rounded-md border border-border/60 bg-background px-2 py-1.5"
              >
                <option value="" disabled>
                  Choose a key
                </option>
                {localKeyIdentities.map((identity) => (
                  <option key={identity.reference} value={identity.reference}>
                    {identity.label}
                  </option>
                ))}
              </select>
            )}
            {selectedKey && (
              <p
                data-testid="selected-key-fingerprint"
                className="text-xs text-muted-foreground"
              >
                Fingerprint: {selectedKey.fingerprint}
              </p>
            )}
          </label>

          {provisioningStage && (
            <p className="text-sm text-muted-foreground">{provisioningStage}</p>
          )}
          {provisioningError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {provisioningError}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        {!existingInstance && (
          <Button
            disabled={!region || !size || !keyReference || submitting}
            onClick={() => void handleProvision()}
          >
            {submitting ? "Provisioning..." : "Provision VM"}
          </Button>
        )}
      </div>
    </>
  );
}
