import { randomBytes } from 'node:crypto';
import { ethers } from 'ethers';
import { supabaseAdmin } from '../lib/supabase.js';
import { profileService } from './profile.service.js';
import type { Profile } from '../types/index.js';

/**
 * Wallet LINKING (not login). The user is already signed in with their
 * email/Gmail account; this proves they also own the wallet they're connecting,
 * then binds that wallet address to their account.
 *
 * Flow:
 *   1. requestNonce(userId, wallet) → store a one-time nonce, return message
 *   2. user signs the message in their wallet (MetaMask etc.) — no gas, no tx
 *   3. linkWallet(userId, wallet, signature) → verify signer, bind to account
 */

/** Deterministic message the user signs. Rebuildable from wallet + nonce. */
function buildSignMessage(wallet: string, nonce: string): string {
  return [
    'Link this wallet to your AgriBridge account.',
    '',
    'Signing proves you own this wallet. It is free and will NOT trigger a',
    'blockchain transaction.',
    '',
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

export const walletService = {
  /** Step 1 — issue a nonce for (user, wallet) and return the message to sign. */
  async requestNonce(userId: string, wallet: string): Promise<{ message: string }> {
    if (!ethers.isAddress(wallet)) throw new Error('Invalid wallet address');
    const address = wallet.toLowerCase();
    const nonce = randomBytes(16).toString('hex');

    const { error } = await supabaseAdmin.from('wallet_link_nonces').upsert(
      {
        user_id: userId,
        wallet_address: address,
        nonce,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw error;

    return { message: buildSignMessage(address, nonce) };
  },

  /** Step 3 — verify the signature and bind the wallet to the account. */
  async linkWallet(userId: string, wallet: string, signature: string): Promise<Profile> {
    if (!ethers.isAddress(wallet)) throw new Error('Invalid wallet address');
    const address = wallet.toLowerCase();

    const { data: row, error } = await supabaseAdmin
      .from('wallet_link_nonces')
      .select('wallet_address, nonce, expires_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error('No nonce found — request a nonce first');
    if (row.wallet_address !== address) throw new Error('Wallet does not match the nonce request');
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error('Nonce expired');

    const message = buildSignMessage(address, row.nonce);
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== address) throw new Error('Signature does not match wallet');

    // One-time use: burn the nonce so the signature can't be replayed.
    await supabaseAdmin.from('wallet_link_nonces').delete().eq('user_id', userId);

    return profileService.linkWallet(userId, address);
  },
};
