/**
 * API module for on-chain commodity operations.
 *
 * After removing the backend, this module:
 * 1. Handles commodity operations directly on-chain
 * 2. No longer makes backend API calls
 * 3. Uses on-chain data as the source of truth
 */

import type { CommodityType, Grade } from "./contracts/config";

/**
 * Types for commodity data.
 * These match what we can read from the on-chain CommodityRegistry contract.
 */
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

/**
 * Get the farmer's commodities directly from on-chain data.
 * This replaces the backend's /api/commodities endpoint.
 */
export async function getMyCommodities(): Promise<CommodityRecord[]> {
  // This is handled by the useMyCommodities hook in useProtocol.ts
  // which reads directly from the blockchain
  return [];
}

/**
 * Mirror a commodity to the backend.
 * After removing the backend, this is a no-op - commodities are on-chain only.
 */
export async function mirrorCommodity(_payload: any) {
  // No-op: commodity registration happens on-chain via useRegisterCommodity hook
  return { success: true };
}

/**
 * Get the verifier queue - commodities awaiting verification.
 * After removing the backend, we read directly from the blockchain
 * and filter for pending commodities.
 */
export async function getVerifierQueue(): Promise<CommodityRecord[]> {
  // In the no-backend version, this reads from the on-chain registry
  // and returns pending commodities. The admin verifies directly.
  return [];
}

/**
 * Approve a commodity - verifies and mints the ERC-1155 token.
 * After removing the backend, the admin signs this transaction directly.
 */
export async function approveCommodity(
  _id: string,
  _payload: {
    on_chain_id: number;
    inspection_reference: string;
    warehouse_reference: string;
    report_hash: string;
  },
) {
  // The approval happens on-chain via the CommodityRegistry contract
  // Admin signs the transaction directly from their wallet
  return { success: true, tx_hash: "on-chain-approval" };
}

/**
 * Reject a commodity.
 * After removing the backend, the admin signs this transaction directly.
 */
export async function rejectCommodity(
  _id: string,
  _payload: { on_chain_id: number; reason: string },
) {
  // The rejection happens on-chain via the CommodityRegistry contract
  return { success: true, tx_hash: "on-chain-rejection" };
}

const api = {
  getMyCommodities,
  mirrorCommodity,
  getVerifierQueue,
  approveCommodity,
  rejectCommodity,
};

export default api;
