import { Router } from 'express';
import { commoditiesController } from '../controllers/commodities.controller.js';
import { verifierController } from '../controllers/verifier.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

// ─── Commodities (farmer-facing) ───────────────────────────
router.post('/commodities', requireAuth, commoditiesController.submit);
router.get('/commodities', requireAuth, commoditiesController.listMine);

// ─── Verifier (backend engineer-facing) ────────────────────
router.get('/verifier/queue', requireAuth, verifierController.queue);
router.post('/verifier/commodities/:id/approve', requireAuth, verifierController.approve);
router.post('/verifier/commodities/:id/reject', requireAuth, verifierController.reject);
