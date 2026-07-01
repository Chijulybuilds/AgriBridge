import { supabaseAdmin } from '../lib/supabase.js';
import { CommodityStatus, type CommodityRecord } from '../types/index.js';

/**
 * Off-chain commodity data access. This is the Supabase-facing half of the
 * flow: when a farmer submits a commodity from the frontend we persist a
 * "Pending" mirror row here, then keep it in sync as the on-chain status
 * changes (Verified / Rejected / Collateralized ...).
 *
 * NOTE: bodies are stubbed. They get wired to real Supabase queries in the
 * "Supabase connection" integration step.
 */
export const commodityService = {
  async create(
    input: Omit<CommodityRecord, 'id' | 'on_chain_id' | 'status' | 'token_id' | 'verifier_wallet' | 'tx_hash' | 'created_at' | 'updated_at'>,
  ): Promise<CommodityRecord> {
    const { data, error } = await supabaseAdmin
      .from('commodities')
      .insert({ ...input, status: CommodityStatus.Pending })
      .select()
      .single();
    if (error) throw error;
    return data as CommodityRecord;
  },

  async listByFarmer(farmerWallet: string): Promise<CommodityRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('commodities')
      .select('*')
      .eq('farmer_wallet', farmerWallet)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CommodityRecord[];
  },

  async listPending(): Promise<CommodityRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('commodities')
      .select('*')
      .eq('status', CommodityStatus.Pending)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CommodityRecord[];
  },

  async updateStatus(
    id: string,
    status: CommodityStatus,
    patch: Partial<CommodityRecord> = {},
  ): Promise<CommodityRecord> {
    const { data, error } = await supabaseAdmin
      .from('commodities')
      .update({ status, ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as CommodityRecord;
  },
};
