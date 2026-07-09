import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { profileService } from "../services/profile.service.js";
import type { AuthUser, UserRole } from "../types/index.js";

function redactToken(token: string | null | undefined) {
  if (!token) return null;
  if (token.length <= 12) return "[redacted]";
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function logAuth(message: string, details: Record<string, unknown> = {}) {
  console.error(`[auth] ${message}`, details);
}

/**
 * Account auth: the frontend logs in with Supabase (email/password or Google)
 * and sends the resulting access token as `Authorization: Bearer <token>`.
 * We verify it with Supabase, then load the user's profile (role + linked
 * wallet) so downstream guards and controllers have them.
 */
export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const path = req.originalUrl || req.url || "unknown";

  logAuth("auth check started", {
    method: req.method,
    path,
    hasBearerHeader: Boolean(header),
    tokenPreview: redactToken(token),
  });

  if (!token) {
    logAuth("missing bearer token", { method: req.method, path });
    return res.status(401).json({ error: "Missing bearer token" });
  }

  let userId: string | null = null;

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data.user) {
      userId = data.user.id;
      logAuth("supabase token accepted", {
        method: req.method,
        path,
        userId,
      });
    } else {
      logAuth("supabase token rejected", {
        method: req.method,
        path,
        error: error?.message ?? "unknown supabase error",
      });
    }
  } catch (error) {
    logAuth("supabase token verification threw", {
      method: req.method,
      path,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  if (!userId) {
    try {
      userId = profileService.verifySessionToken(token);
      if (userId) {
        logAuth("fallback session token accepted", {
          method: req.method,
          path,
          userId,
        });
      } else {
        logAuth("fallback session token rejected", {
          method: req.method,
          path,
          tokenPreview: redactToken(token),
        });
      }
    } catch (error) {
      logAuth("fallback session token verification failed", {
        method: req.method,
        path,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  if (!userId) {
    logAuth("authorization failed", { method: req.method, path });
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const profile = await profileService.getById(userId);
    req.user = {
      id: userId,
      email: profile?.email ?? null,
      role: profile?.role ?? "farmer",
      wallet: profile?.wallet_address ?? null,
    };
    logAuth("authorization succeeded", {
      method: req.method,
      path,
      userId,
      role: req.user.role,
      wallet: req.user.wallet,
    });
    next();
  } catch (error) {
    logAuth("profile lookup failed after auth", {
      method: req.method,
      path,
      userId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return res.status(500).json({ error: "Failed to load profile" });
  }
}

/** Restricts a route to specific roles (e.g. requireRole('admin')). */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: "Insufficient role" });
    next();
  };
}

/** Requires the account to have a wallet linked (needed for on-chain actions). */
export function requireWallet(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (!req.user.wallet) {
    return res.status(403).json({ error: "Connect and link a wallet first" });
  }
  next();
}
