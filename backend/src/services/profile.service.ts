import { supabaseAdmin } from '../lib/supabase.js';
import type { Profile } from '../types/index.js';

/** Profiles are keyed by wallet address — the identity users sign in with. */
export const profileService = {
  async getByWallet(wallet: string): Promise<Profile | null> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('wallet_address', wallet.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return (data as Profile) ?? null;
  },

  /**
   * On first sign-in, creates the profile with the default 'farmer' role.
   * On return visits, only bumps last_login_at — it never overwrites an
   * existing role (so a wallet promoted to 'admin'/'investor' stays that way).
   */
  async upsertOnLogin(wallet: string): Promise<Profile> {
    const address = wallet.toLowerCase();
    const existing = await this.getByWallet(address);

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('wallet_address', address)
        .select()
        .single();
      if (error) throw error;
      return data as Profile;
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert({ wallet_address: address, role: 'farmer', last_login_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data as Profile;
  },
};
