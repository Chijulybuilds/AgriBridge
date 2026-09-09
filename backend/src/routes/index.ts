import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { commoditiesController } from '../controllers/commodities.controller.js';
import { verifierController } from '../controllers/verifier.controller.js';
import { requireAuth, requireRole, requireWallet } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const router = Router();

// Every handler is async, so each is wrapped: Express 4 does not forward
// promise rejections on its own, and an unwrapped handler would hang the
// request instead of returning a status.

// ─── Wallet Authentication (SIWE) ───
router.post('/account/wallet/nonce', asyncHandler(authController.nonce)); // request message to sign
router.post('/account/wallet/auth', asyncHandler(authController.verify)); // submit signature
router.get('/account/me', requireAuth, asyncHandler(authController.me)); // current profile

// ─── Commodities (farmer-facing; requires authentication) ─
router.post(
  '/commodities',
  requireAuth,
  requireWallet,
  asyncHandler(commoditiesController.submit),
);
router.get(
  '/commodities',
  requireAuth,
  requireWallet,
  asyncHandler(commoditiesController.listMine),
);

// ─── Verifier (admin-only) ─────────────────────────────────
router.get(
  '/verifier/queue',
  requireAuth,
  requireRole('admin'),
  asyncHandler(verifierController.queue),
);
router.post(
  '/verifier/commodities/:id/approve',
  requireAuth,
  requireRole('admin'),
  asyncHandler(verifierController.approve),
);
router.post(
  '/verifier/commodities/:id/reject',
  requireAuth,
  requireRole('admin'),
  asyncHandler(verifierController.reject),
);
