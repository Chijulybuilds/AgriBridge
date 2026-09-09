import { randomBytes } from 'node:crypto';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { profileService } from './profile.service.js';
import type { AuthUser, Profile, SignupRole } from '../types/index.js';
import { AuthError, BadRequestError } from '../lib/errors.js';

/**
 * Wallet-based authentication (Sign-In with Ethereum).
 *
 * Flow:
 *   1. requestNonce(wallet)  → store a one-time nonce, return the message to sign
 *   2. user signs the message in their wallet (MetaMask etc.) — no gas, no tx
 *   3. verify(wallet, signature) → recover the signer, confirm it matches,
 *      upsert the profile, and issue a session JWT
 */

/**
 * Deterministic message the user signs, in Sign-In with Ethereum shape.
 *
 * The domain, URI and chain id are bound into the signed text so a signature
 * collected by another site cannot be replayed against this backend, and the
 * issued/expiry pair bounds how long a captured signature stays useful. The
 * message is rebuilt server-side from the stored nonce at verification time, so
 * the client cannot influence what was actually signed.
 */
function buildSignMessage(wallet: string, nonce: string, issuedAt: string, expiresAt: string): string {
  return [
    `${env.APP_DOMAIN} wants you to sign in with your Ethereum account:`,
    ethers.getAddress(wallet),
    '',
    'Sign this message to verify you own this wallet and log in to AgriBridge.',
    'This is free and will NOT trigger a blockchain transaction.',
    '',
    `URI: ${env.APP_URI}`,
    'Version: 1',
    `Chain ID: ${env.CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
  ].join('\n');
}

const NONCE_TTL_MS = 10 * 60_000;

export const authService = {
  /** Step 1 — issue a fresh nonce and return the exact message to sign. */
  async requestNonce(wallet: string): Promise<{ message: string; nonce: string }> {
    if (!ethers.isAddress(wallet)) throw new BadRequestError('Invalid wallet address');
    const address = wallet.toLowerCase();
    const nonce = randomBytes(16).toString('hex');

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);

    const { error } = await supabaseAdmin.from('auth_nonces').upsert(
      {
        wallet_address: address,
        nonce,
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'wallet_address' },
    );
    if (error) throw error;

    return {
      message: buildSignMessage(address, nonce, issuedAt.toISOString(), expiresAt.toISOString()),
      nonce,
    };
  },

  /**
   * Step 3 — verify the signature, log the user in, and return a JWT.
   *
   * @param requestedRole Role to assign if this wallet has never signed in before.
   *                      Ignored for existing profiles, so a wallet cannot escalate
   *                      itself to admin by asking for it at login.
   */
  async verify(
    wallet: string,
    signature: string,
    requestedRole?: SignupRole,
  ): Promise<{ token: string; profile: Profile }> {
    if (!ethers.isAddress(wallet)) throw new BadRequestError('Invalid wallet address');
    const address = wallet.toLowerCase();

    const { data: row, error } = await supabaseAdmin
      .from('auth_nonces')
      .select('nonce, issued_at, expires_at')
      .eq('wallet_address', address)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new AuthError('No nonce found — request a nonce first');
    if (new Date(row.expires_at).getTime() < Date.now()) throw new AuthError('Nonce expired');

    // Rebuild the message server-side from stored values, then recover the signer.
    const message = buildSignMessage(address, row.nonce, row.issued_at, row.expires_at);

    let recovered: string;
    try {
      recovered = ethers.verifyMessage(message, signature);
    } catch {
      throw new AuthError('Malformed signature');
    }
    if (recovered.toLowerCase() !== address) throw new AuthError('Signature does not match wallet');

    // One-time use: burn the nonce so the signature can't be replayed.
    await supabaseAdmin.from('auth_nonces').delete().eq('wallet_address', address);

    const profile = await profileService.upsertOnLogin(address, requestedRole);
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
