import { useEffect, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  type TreqSendAsset,
  type TreqSendPayload,
  TREQ_SEND_EVENT,
} from "../lib/treqSend";
import { useTreqSendStore } from "../stores/treqSendStore";

export interface TreqSendContextValue {
  assets: TreqSendAsset[];
  dismissAsset: (id: string) => void;
  clearSessionAssets: (ptySessionId: string) => void;
  ingestPayload: (payload: TreqSendPayload | TreqSendAsset) => void;
}

export function TreqSendProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<TreqSendPayload>(TREQ_SEND_EVENT, (event) => {
      useTreqSendStore.getState().ingestPayload(event.payload);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => {
        console.error("Failed to listen for treq send events:", error);
      });
    return () => {
      unlisten?.();
    };
  }, []);

  return children;
}

export function useTreqSend(): TreqSendContextValue {
  const assets = useTreqSendStore((s) => s.assets);
  const dismissAsset = useTreqSendStore((s) => s.dismissAsset);
  const clearSessionAssets = useTreqSendStore((s) => s.clearSessionAssets);
  const ingestPayload = useTreqSendStore((s) => s.ingestPayload);
  return { assets, dismissAsset, clearSessionAssets, ingestPayload };
}

/** Same as useTreqSend; kept for panels that used to render outside a provider. */
export function useTreqSendOptional(): TreqSendContextValue {
  return useTreqSend();
}
