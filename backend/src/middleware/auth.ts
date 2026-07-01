import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

/**
 * Verifies the Supabase JWT sent as `Authorization: Bearer <token>` and
 * attaches the user to the request. Frontend obtains this token from Supabase
 * Auth after the farmer/investor signs in.
 */
export interface AuthedRequest extends Request {
  user?: { id: string; email?: string };
  accessToken?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid or expired token' });

  req.user = { id: data.user.id, email: data.user.email };
  req.accessToken = token;
  next();
}
