/**
 * Types mirroring the on-chain enums (see src/CommodityRegistry.sol) so the
 * off-chain DB and API speak the same language as the contracts.
 */

export enum CommodityType {
  Cocoa = 'Cocoa',
  Rice = 'Rice',
  Maize = 'Maize',
  Cashew = 'Cashew',
  Yam = 'Yam',
}

export enum Grade {
  A = 'A',
  B = 'B',
  C = 'C',
}

export enum CommodityStatus {
  Pending = 'Pending',
  Verified = 'Verified',
  Rejected = 'Rejected',
  Collateralized = 'Collateralized',
  Released = 'Released',
  Liquidated = 'Liquidated',
  Expired = 'Expired',
}

/** The order of enum members on-chain — used to convert to/from Solidity uint8. */
export const COMMODITY_TYPE_ORDER: CommodityType[] = [
  CommodityType.Cocoa,
  CommodityType.Rice,
  CommodityType.Maize,
  CommodityType.Cashew,
  CommodityType.Yam,
];

export const GRADE_ORDER: Grade[] = [Grade.A, Grade.B, Grade.C];

/** A commodity record as stored off-chain in Supabase (mirror of the chain). */
export interface CommodityRecord {
  id: string;
  on_chain_id: number | null;
  farmer_wallet: string;
  commodity_type: CommodityType;
  grade: Grade;
  quantity_kg: number;
  harvest_date: string;
  storage_duration_days: number;
  status: CommodityStatus;
  token_id: number | null;
  verifier_wallet: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}
