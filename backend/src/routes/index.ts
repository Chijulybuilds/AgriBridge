import { Router } from 'express';
import { accountController } from '../controllers/account.controller.js';
import { walletController } from '../controllers/wallet.controller.js';
import { commoditiesController } from '../controllers/commodities.controller.js';
import { verifierController } from '../controllers/verifier.controller.js';
import { requireAuth, requireRole, requireWallet } from '../middleware/auth.js';

export const router = Router();

// ─── Account (email/Gmail login handled on the frontend via Supabase) ──
router.get('/account/me', requireAuth, accountController.me);

// ─── Wallet linking (after login, inside the dashboard) ────
router.post('/wallet/nonce', requireAuth, walletController.nonce); // message to sign
router.post('/wallet/link', requireAuth, walletController.link); // signature → linked

// ─── Commodities (farmer-facing; requires a linked wallet) ─
router.post('/commodities', requireAuth, requireWallet, commoditiesController.submit);
router.get('/commodities', requireAuth, requireWallet, commoditiesController.listMine);

// ─── Verifier (admin-only) ─────────────────────────────────
router.get('/verifier/queue', requireAuth, requireRole('admin'), verifierController.queue);
router.post('/verifier/commodities/:id/approve', requireAuth, requireRole('admin'), verifierController.approve);
router.post('/verifier/commodities/:id/reject', requireAuth, requireRole('admin'), verifierController.reject);
