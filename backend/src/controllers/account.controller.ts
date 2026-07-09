import type { Request, Response } from "express";
import { profileService } from "../services/profile.service.js";
import type { AuthedRequest } from "../middleware/auth.js";

function logAccount(message: string, details: Record<string, unknown> = {}) {
  console.error(`[account] ${message}`, details);
}

/**
 * Account endpoints. MetaMask wallet authentication creates or signs in
 * the account server-side and returns a Supabase session token.
 */
export const accountController = {
  /** GET /api/account/me — the signed-in user + their profile. */
  async me(req: AuthedRequest, res: Response) {
    try {
      const profile = await profileService.getById(req.user!.id);
      await profileService.touchLogin(req.user!.id);
      res.json({ user: req.user, profile });
    } catch (error) {
      logAccount("GET /account/me failed", {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ error: "Unable to load account" });
    }
  },

  /** POST /api/account/signup — create a Supabase user as confirmed (server-side). */
  async createUser(req: Request, res: Response) {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    try {
      const user = await profileService.createConfirmedUser(email, password);
      return res.status(201).json({ user });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create account";
      logAccount("signup failed", {
        email,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(400).json({ error: message });
    }
  },

  /** POST /api/account/login — sign in via the backend using a Supabase token. */
  async login(req: Request, res: Response) {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    try {
      const result = await profileService.signInWithPassword(email, password);
      return res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sign in";
      logAccount("login failed", {
        email,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(401).json({ error: message });
    }
  },

  /** POST /api/account/wallet/nonce — return a message the wallet should sign. */
  async walletNonce(req: Request, res: Response) {
    const { wallet } = req.body ?? {};

    if (!wallet) {
      logAccount("wallet nonce rejected missing wallet", { body: req.body });
      return res.status(400).json({ error: "wallet is required" });
    }

    try {
      const message = profileService.buildWalletAuthMessage(wallet);
      logAccount("wallet nonce issued", { wallet });
      return res.json({ message });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to prepare wallet auth";
      logAccount("wallet nonce failed", {
        wallet,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(400).json({ error: message });
    }
  },

  /** POST /api/account/wallet/auth — verify wallet signature and create/sign in account. */
  async walletAuth(req: Request, res: Response) {
    const { wallet, signature } = req.body ?? {};

    if (!wallet || !signature) {
      logAccount("wallet auth rejected missing fields", {
        wallet: wallet ?? null,
        signatureLength: signature?.length ?? 0,
      });
      return res
        .status(400)
        .json({ error: "wallet and signature are required" });
    }

    try {
      logAccount("wallet auth started", {
        wallet,
        signatureLength: signature.length,
      });
      const result = await profileService.signInWithWallet(wallet, signature);
      logAccount("wallet auth succeeded", {
        wallet,
        userId: result.user?.id,
      });
      return res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wallet authentication failed";
      logAccount("wallet auth failed", {
        wallet,
        signatureLength: signature.length,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(401).json({ error: message });
    }
  },
};
