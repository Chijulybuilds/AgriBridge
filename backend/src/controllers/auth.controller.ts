import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { profileService } from '../services/profile.service.js';
import type { AuthedRequest } from '../middleware/auth.js';

const walletSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid wallet address');

export const authController = {
  /** POST /api/account/wallet/nonce — { wallet } → { message } to sign in the wallet. */
  async nonce(req: Request, res: Response, next: NextFunction) {
    try {
      const { wallet } = z.object({ wallet: walletSchema }).parse(req.body);
      const { message } = await authService.requestNonce(wallet);
      res.json({ message });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/account/wallet/auth — { wallet, signature } → { session: { access_token }, profile }. */
  async verify(req: Request, res: Response, next: NextFunction) {
    try {
      const { wallet, signature } = z
        .object({ wallet: walletSchema, signature: z.string().min(1) })
        .parse(req.body);
      const { token, profile } = await authService.verify(wallet, signature);
      
      res.json({
        session: { access_token: token },
        profile: {
          id: profile.wallet_address,
          email: null,
          display_name: profile.display_name,
          wallet_address: profile.wallet_address,
          role: profile.role,
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/account/me — returns the signed-in user's profile. */
  async me(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const profile = await profileService.getByWallet(req.user!.wallet);
      if (!profile) return res.status(404).json({ error: 'Profile not found' });
      
      res.json({
        user: req.user,
        profile: {
          id: profile.wallet_address,
          email: null,
          display_name: profile.display_name,
          wallet_address: profile.wallet_address,
          role: profile.role,
        }
      });
    } catch (err) {
      next(err);
    }
  },
};
