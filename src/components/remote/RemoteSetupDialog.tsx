import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type {
  InstanceStatusResponse,
  RegionCode,
  SizePreset,
} from "../../lib/api-types-remote";
import { RemoteManagedSetupPanel } from "./RemoteManagedSetupPanel";
import { RemoteUserManagedSetupPanel } from "./RemoteUserManagedSetupPanel";
import type {
  LocalKeyIdentity,
  UserManagedFormValues,
} from "./remoteSetupLabels";

export type { LocalKeyIdentity, UserManagedFormValues };

export type RemoteSetupMode = "choice" | "managed" | "user_managed";

export interface RemoteSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  regions: RegionCode[];
  sizePresets: SizePreset[];
  localKeyIdentities: LocalKeyIdentity[];
  /** Autocomplete-only suggestions read from `~/.ssh/config` (Goal 15 / Phase 1). Selecting one only fills the field. */
  sshConfigAliasSuggestions: string[];

  instanceStatus: InstanceStatusResponse | null;
  provisioningStage?: string;
  provisioningError?: string;

  onProvisionManaged: (
    region: RegionCode,
    size: SizePreset,
    keyReference: string,
  ) => Promise<void>;
  onWake: () => Promise<void>;
  onReprovision: (region: RegionCode, size: SizePreset) => Promise<void>;
  onDeleteInstance: () => Promise<void>;
  onRevokeKey: (keyReference: string) => Promise<void>;
  onConnectManaged: (keyReference: string) => Promise<void>;

  onRegisterUserManaged: (values: UserManagedFormValues) => Promise<void>;
}

/**
 * Remote setup flow: the two-choice entry point plus the managed and
 * user-managed configuration screens (PRD "UI requirements" / "Remote
 * setup"). Replaces the old bare host+path dialog. The two configuration
 * screens live in `RemoteManagedSetupPanel` and
 * `RemoteUserManagedSetupPanel`; this component only owns which screen is
 * showing.
 */
export function RemoteSetupDialog({
  open,
  onOpenChange,
  regions,
  sizePresets,
  localKeyIdentities,
  sshConfigAliasSuggestions,
  instanceStatus,
  provisioningStage,
  provisioningError,
  onProvisionManaged,
  onWake,
  onReprovision,
  onDeleteInstance,
  onRevokeKey,
  onConnectManaged,
  onRegisterUserManaged,
}: RemoteSetupDialogProps) {
  const [mode, setMode] = useState<RemoteSetupMode>("choice");

  useEffect(() => {
    if (open) setMode("choice");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {mode === "choice" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect a remote repository</DialogTitle>
              <DialogDescription>
                Choose how the remote machine is managed.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-lg border border-border/60 p-4 text-left hover:border-primary/60 hover:bg-muted/40"
                onClick={() => setMode("managed")}
              >
                <div className="font-medium">Treq-managed VM</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Treq provisions and maintains a development VM for you. Pick a
                  region and size; no server to set up.
                </p>
              </button>
              <button
                type="button"
                className="rounded-lg border border-border/60 p-4 text-left hover:border-primary/60 hover:bg-muted/40"
                onClick={() => setMode("user_managed")}
              >
                <div className="font-medium">Your own VM</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect to a machine you already run. You install Treq, JJ,
                  Git, and agents there yourself.
                </p>
              </button>
            </div>
          </>
        )}

        {mode === "managed" && (
          <>
            <DialogHeader>
              <DialogTitle>Treq-managed VM</DialogTitle>
              <DialogDescription>
                Treq owns provisioning and lifecycle for this VM. You keep full
                owner access over SSH.
              </DialogDescription>
            </DialogHeader>
            <RemoteManagedSetupPanel
              regions={regions}
              sizePresets={sizePresets}
              localKeyIdentities={localKeyIdentities}
              instanceStatus={instanceStatus}
              provisioningStage={provisioningStage}
              provisioningError={provisioningError}
              onBack={() => setMode("choice")}
              onProvisionManaged={onProvisionManaged}
              onWake={onWake}
              onReprovision={onReprovision}
              onDeleteInstance={onDeleteInstance}
              onRevokeKey={onRevokeKey}
              onConnectManaged={onConnectManaged}
            />
          </>
        )}

        {mode === "user_managed" && (
          <>
            <DialogHeader>
              <DialogTitle>Your own VM</DialogTitle>
              <DialogDescription>
                Enter the connection details exactly - Treq never infers trust
                from your local SSH configuration.
              </DialogDescription>
            </DialogHeader>
            <RemoteUserManagedSetupPanel
              sshConfigAliasSuggestions={sshConfigAliasSuggestions}
              onBack={() => setMode("choice")}
              onRegisterUserManaged={onRegisterUserManaged}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
