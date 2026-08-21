import { create } from "zustand";
import {
  parseTreqSendPayload,
  type TreqSendAsset,
  type TreqSendPayload,
} from "../lib/treqSend";

export interface TreqSendState {
  assets: TreqSendAsset[];
  ingestPayload: (payload: TreqSendPayload | TreqSendAsset) => void;
  dismissAsset: (id: string) => void;
  clearSessionAssets: (ptySessionId: string) => void;
}

export const defaultTreqSendState = {
  assets: [] as TreqSendAsset[],
};

export const useTreqSendStore = create<TreqSendState>((set) => ({
  ...defaultTreqSendState,
  ingestPayload: (payload) => {
    const asset =
      "id" in payload && "mediaType" in payload
        ? (payload as TreqSendAsset)
        : parseTreqSendPayload(payload);
    if (!asset) return;
    set((state) => {
      if (state.assets.some((existing) => existing.id === asset.id)) {
        return state;
      }
      return { assets: [...state.assets, asset] };
    });
  },
  dismissAsset: (id) =>
    set((state) => ({
      assets: state.assets.filter((asset) => asset.id !== id),
    })),
  clearSessionAssets: (ptySessionId) =>
    set((state) => ({
      assets: state.assets.filter(
        (asset) => asset.ptySessionId !== ptySessionId,
      ),
    })),
}));
