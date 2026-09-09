import { randomBytes } from 'node:crypto';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { profileService } from './profile.service.js';
import type { AuthUser, Profile } from '../types/index.js';

/**
 * Wallet-based authentication (Sign-In with Ethereum).
 *
 * Flow:
 *   1. requestNonce(wallet)  → store a one-time nonce, return the message to sign
 *   2. user signs the message in their wallet (MetaMask etc.) — no gas, no tx
 *   3. verify(wallet, signature) → recover the signer, confirm it matches,
 *      upsert the profile, and issue a session JWT
 */

/** Deterministic message the user signs. Rebuildable from wallet + nonce. */
function buildSignMessage(wallet: string, nonce: string): string {
  return [
    'Welcome to AgriBridge!',
    '',
    'Sign this message to verify you own this wallet and log in.',
    'This is free and will NOT trigger a blockchain transaction.',
    '',
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

export const authService = {
  /** Step 1 — issue a fresh nonce and return the exact message to sign. */
  async requestNonce(wallet: string): Promise<{ message: string; nonce: string }> {
    if (!ethers.isAddress(wallet)) throw new Error('Invalid wallet address');
    const address = wallet.toLowerCase();
    const nonce = randomBytes(16).toString('hex');

    const { error } = await supabaseAdmin
      .from('auth_nonces')
      .upsert(
        { wallet_address: address, nonce, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() },
        { onConflict: 'wallet_address' },
      );
    if (error) throw error;

    return { message: buildSignMessage(address, nonce), nonce };
  },

  /** Step 3 — verify the signature, log the user in, and return a JWT. */
  async verify(wallet: string, signature: string): Promise<{ token: string; profile: Profile }> {
    if (!ethers.isAddress(wallet)) throw new Error('Invalid wallet address');
    const address = wallet.toLowerCase();

    const { data: row, error } = await supabaseAdmin
      .from('auth_nonces')
      .select('nonce, expires_at')
      .eq('wallet_address', address)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error('No nonce found — request a nonce first');
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error('Nonce expired');

    // Recover the address that produced this signature over the expected message.
    const message = buildSignMessage(address, row.nonce);
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== address) throw new Error('Signature does not match wallet');

    // One-time use: burn the nonce so the signature can't be replayed.
    await supabaseAdmin.from('auth_nonces').delete().eq('wallet_address', address);

    const profile = await profileService.upsertOnLogin(address);
    const token = this.issueToken({ wallet: address, role: profile.role });
    return { token, profile };
  },

  issueToken(user: AuthUser): string {
    return jwt.sign(user, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  },

  verifyToken(token: string): AuthUser {
    const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & AuthUser;
    return { wallet: decoded.wallet, role: decoded.role };
  },
};
