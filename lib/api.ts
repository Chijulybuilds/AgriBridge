import { authedFetch } from "./auth";
import type { CommodityType, Grade } from "./contracts/config";

/**
 * Backend API.
 *
 * The chain is the source of truth for commodities, collateral and loans; those
 * are read and written directly through Wagmi. The backend covers what the
 * chain cannot: a searchable mirror for the verifier queue, and the verifier's
 * own approve and reject actions, which are signed by a wallet holding
 * VERIFIER_ROLE rather than by the end user.
 */

export type CommodityMirror = {
  commodity_type: CommodityType;
  grade: Grade;
  quantity_kg: number;
  harvest_date: string;
  storage_duration_days: number;
  on_chain_id?: number;
};

export type CommodityRecord = {
  id: string;
  on_chain_id: number | null;
  farmer_wallet: string;
  commodity_type: CommodityType;
  grade: Grade;
  quantity_kg: number;
  harvest_date: string;
  storage_duration_days: number;
  status: string;
  token_id: number | null;
  verifier_wallet: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
};

/** The signed-in farmer's mirrored commodity records. */
export async function getMyCommodities(): Promise<CommodityRecord[]> {
  const data = await authedFetch("/api/commodities");
  return Array.isArray(data) ? data : (data?.commodities ?? []);
}

/**
 * Mirrors an on-chain registration into the backend.
 *
 * Values are passed through as the exact enum members the contracts and the
 * database share. The previous version guessed at these by substring-matching
 * free text, which silently filed anything unrecognised as Cocoa.
 */
export async function mirrorCommodity(payload: CommodityMirror) {
  return authedFetch("/api/commodities", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Commodities awaiting verification. Admin only. */
export async function getVerifierQueue(): Promise<CommodityRecord[]> {
  const data = await authedFetch("/api/verifier/queue");
  return Array.isArray(data) ? data : (data?.commodities ?? []);
}

export async function approveCommodity(
  id: string,
  payload: {
    on_chain_id: number;
    inspection_reference: string;
    warehouse_reference: string;
    report_hash: string;
  },
) {
  return authedFetch(`/api/verifier/commodities/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectCommodity(id: string, payload: { on_chain_id: number; reason: string }) {
  return authedFetch(`/api/verifier/commodities/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

const api = {
  getMyCommodities,
  mirrorCommodity,
  getVerifierQueue,
  approveCommodity,
  rejectCommodity,
};

export default api;
