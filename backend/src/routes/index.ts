import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { commoditiesController } from '../controllers/commodities.controller.js';
import { verifierController } from '../controllers/verifier.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const router = Router();

// ─── Auth (wallet sign-in / SIWE) ──────────────────────────
router.post('/auth/nonce', authController.nonce); // request message to sign
router.post('/auth/verify', authController.verify); // submit signature → JWT
router.get('/auth/me', requireAuth, authController.me);

// ─── Commodities (farmer-facing) ───────────────────────────
router.post('/commodities', requireAuth, commoditiesController.submit);
router.get('/commodities', requireAuth, commoditiesController.listMine);

// ─── Verifier (admin-only) ─────────────────────────────────
router.get('/verifier/queue', requireAuth, requireRole('admin'), verifierController.queue);
router.post('/verifier/commodities/:id/approve', requireAuth, requireRole('admin'), verifierController.approve);
router.post('/verifier/commodities/:id/reject', requireAuth, requireRole('admin'), verifierController.reject);
