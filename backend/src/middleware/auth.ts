import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { profileService } from '../services/profile.service.js';
import type { AuthUser, UserRole } from '../types/index.js';

/**
 * Account auth: the frontend logs in with Supabase (email/password or Google)
 * and sends the resulting access token as `Authorization: Bearer <token>`.
 * We verify it with Supabase, then load the user's profile (role + linked
 * wallet) so downstream guards and controllers have them.
 */
export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid or expired token' });

  const profile = await profileService.getById(data.user.id);
  req.user = {
    id: data.user.id,
    email: data.user.email ?? null,
    role: profile?.role ?? 'farmer',
    wallet: profile?.wallet_address ?? null,
  };
  next();
}

/** Restricts a route to specific roles (e.g. requireRole('admin')). */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient role' });
    next();
  };
}

/** Requires the account to have a wallet linked (needed for on-chain actions). */
export function requireWallet(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.user.wallet) {
    return res.status(403).json({ error: 'Connect and link a wallet first' });
  }
  next();
}
