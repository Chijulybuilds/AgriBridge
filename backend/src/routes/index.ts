import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { commoditiesController } from '../controllers/commodities.controller.js';
import { verifierController } from '../controllers/verifier.controller.js';
import { requireAuth, requireRole, requireWallet } from '../middleware/auth.js';

export const router = Router();

// ─── Wallet Authentication (SIWE) ───
router.post('/account/wallet/nonce', authController.nonce); // request nonce message
router.post('/account/wallet/auth', authController.verify); // submit signature to authenticate
router.get('/account/me', requireAuth, authController.me); // get current profile

// ─── Commodities (farmer-facing; requires authentication) ─
router.post('/commodities', requireAuth, requireWallet, commoditiesController.submit);
router.get('/commodities', requireAuth, requireWallet, commoditiesController.listMine);

// ─── Verifier (admin-only) ─────────────────────────────────
router.get('/verifier/queue', requireAuth, requireRole('admin'), verifierController.queue);
router.post('/verifier/commodities/:id/approve', requireAuth, requireRole('admin'), verifierController.approve);
router.post('/verifier/commodities/:id/reject', requireAuth, requireRole('admin'), verifierController.reject);
