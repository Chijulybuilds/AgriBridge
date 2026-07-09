import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { accountController } from "../controllers/account.controller.js";
import { walletController } from "../controllers/wallet.controller.js";
import { commoditiesController } from "../controllers/commodities.controller.js";
import { verifierController } from "../controllers/verifier.controller.js";
import { requireAuth, requireRole, requireWallet } from "../middleware/auth.js";

export const router = Router();

function asyncHandler(
  handler: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// ─── Account (wallet-based auth for login/signup) ──
router.get("/account/me", requireAuth, asyncHandler(accountController.me));
router.post("/account/signup", asyncHandler(accountController.createUser));
router.post("/account/login", asyncHandler(accountController.login));
router.post(
  "/account/wallet/nonce",
  asyncHandler(accountController.walletNonce),
);
router.post("/account/wallet/auth", asyncHandler(accountController.walletAuth));
// ─── Wallet linking (after login, inside the dashboard) ────
router.post("/wallet/nonce", requireAuth, asyncHandler(walletController.nonce)); // message to sign
router.post("/wallet/link", requireAuth, asyncHandler(walletController.link)); // signature → linked

// ─── Commodities (farmer-facing; requires a linked wallet) ─
router.post(
  "/commodities",
  requireAuth,
  requireWallet,
  asyncHandler(commoditiesController.submit),
);
router.get(
  "/commodities",
  requireAuth,
  requireWallet,
  asyncHandler(commoditiesController.listMine),
);

// ─── Verifier (admin-only) ─────────────────────────────────
router.get(
  "/verifier/queue",
  requireAuth,
  requireRole("admin"),
  asyncHandler(verifierController.queue),
);
router.post(
  "/verifier/commodities/:id/approve",
  requireAuth,
  requireRole("admin"),
  asyncHandler(verifierController.approve),
);
router.post(
  "/verifier/commodities/:id/reject",
  requireAuth,
  requireRole("admin"),
  asyncHandler(verifierController.reject),
);
