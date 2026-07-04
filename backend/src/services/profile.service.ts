import { supabaseAdmin } from '../lib/supabase.js';
import type { Profile } from '../types/index.js';

/**
 * Profiles are keyed by the Supabase auth user id (the email/Gmail account).
 * A profile row is created automatically by a DB trigger on signup; this
 * service reads it and links a wallet to it later.
 */
export const profileService = {
  async getById(userId: string): Promise<Profile | null> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as Profile) ?? null;
  },

  async getByWallet(wallet: string): Promise<Profile | null> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('wallet_address', wallet.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return (data as Profile) ?? null;
  },

  async touchLogin(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
  },

  /** Binds a verified wallet address to the account (one wallet per account). */
  async linkWallet(userId: string, wallet: string): Promise<Profile> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ wallet_address: wallet.toLowerCase(), wallet_linked_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) {
      // 23505 = unique_violation → wallet already linked to another account.
      if ((error as { code?: string }).code === '23505') {
        throw new Error('This wallet is already linked to another account');
      }
      throw error;
    }
    return data as Profile;
  },
};
