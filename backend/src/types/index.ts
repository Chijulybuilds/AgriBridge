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

/** App-level user roles (distinct from the on-chain VERIFIER_ROLE). */
export type UserRole = 'farmer' | 'investor' | 'admin';

/**
 * A user profile, keyed by the wallet address they signed in with.
 * id/email are optional for backward-compatibility with frontend expectations.
 */
export interface Profile {
  id?: string;
  email?: string | null;
  display_name: string | null;
  wallet_address: string;
  role: UserRole;
  created_at: string;
  last_login_at: string | null;
}

/** The identity attached to an authenticated request (decoded from the custom JWT). */
export interface AuthUser {
  id?: string;
  email?: string | null;
  role: UserRole;
  wallet: string;
}

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
