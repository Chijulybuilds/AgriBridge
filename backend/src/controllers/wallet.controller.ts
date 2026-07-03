import type { Response } from 'express';
import { z } from 'zod';
import { walletService } from '../services/wallet.service.js';
import type { AuthedRequest } from '../middleware/auth.js';

const walletSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid wallet address');

/**
 * Wallet linking — runs AFTER the user is logged in with their account. Proves
 * wallet ownership by signature, then binds the wallet to the account.
 */
export const walletController = {
  /** POST /api/wallet/nonce — { wallet } → { message } to sign. */
  async nonce(req: AuthedRequest, res: Response) {
    const { wallet } = z.object({ wallet: walletSchema }).parse(req.body);
    const { message } = await walletService.requestNonce(req.user!.id, wallet);
    res.json({ message });
  },

  /** POST /api/wallet/link — { wallet, signature } → updated profile. */
  async link(req: AuthedRequest, res: Response) {
    const { wallet, signature } = z
      .object({ wallet: walletSchema, signature: z.string().min(1) })
      .parse(req.body);
    const profile = await walletService.linkWallet(req.user!.id, wallet, signature);
    res.json({ profile });
  },
};
