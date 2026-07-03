import type { Response } from 'express';
import { profileService } from '../services/profile.service.js';
import type { AuthedRequest } from '../middleware/auth.js';

/**
 * Account endpoints. Sign-up / login themselves happen on the frontend via the
 * Supabase client (email/password or Google). The backend just reads the
 * resulting profile and records logins.
 */
export const accountController = {
  /** GET /api/account/me — the signed-in user + their profile. */
  async me(req: AuthedRequest, res: Response) {
    const profile = await profileService.getById(req.user!.id);
    await profileService.touchLogin(req.user!.id);
    res.json({ user: req.user, profile });
  },
};
