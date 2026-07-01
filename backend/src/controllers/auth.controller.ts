import type { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { profileService } from '../services/profile.service.js';
import type { AuthedRequest } from '../middleware/auth.js';

const walletSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid wallet address');

export const authController = {
  /** POST /api/auth/nonce — { wallet } → { message } to sign in the wallet. */
  async nonce(req: Request, res: Response) {
    const { wallet } = z.object({ wallet: walletSchema }).parse(req.body);
    const { message } = await authService.requestNonce(wallet);
    res.json({ message });
  },

  /** POST /api/auth/verify — { wallet, signature } → { token, profile }. */
  async verify(req: Request, res: Response) {
    const { wallet, signature } = z
      .object({ wallet: walletSchema, signature: z.string().min(1) })
      .parse(req.body);
    const { token, profile } = await authService.verify(wallet, signature);
    res.json({ token, profile });
  },

  /** GET /api/auth/me — returns the signed-in user's profile. */
  async me(req: AuthedRequest, res: Response) {
    const profile = await profileService.getByWallet(req.user!.wallet);
    res.json({ user: req.user, profile });
  },
};
