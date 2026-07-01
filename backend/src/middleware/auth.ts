import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import type { AuthUser, UserRole } from '../types/index.js';

/**
 * Verifies the session JWT the backend issued after a successful wallet
 * signature. The token carries the wallet address and role.
 */
export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    req.user = authService.verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Restricts a route to specific roles (e.g. requireRole('admin')). */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
}
