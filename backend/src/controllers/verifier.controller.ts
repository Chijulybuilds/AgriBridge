import type { Response } from 'express';
import { z } from 'zod';
import { commodityService } from '../services/commodity.service.js';
import { chainService } from '../services/chain.service.js';
import { CommodityStatus } from '../types/index.js';
import type { AuthedRequest } from '../middleware/auth.js';

/**
 * The backend engineer's control panel. These endpoints are how the authorized
 * verifier reviews the Pending queue and approves/rejects — which in turn
 * triggers on-chain minting via chainService.
 */
export const verifierController = {
  async queue(_req: AuthedRequest, res: Response) {
    const pending = await commodityService.listPending();
    res.json(pending);
  },

  async approve(req: AuthedRequest, res: Response) {
    const { id } = req.params;
    const body = z
      .object({
        on_chain_id: z.number().int().positive(),
        inspection_reference: z.string().min(1),
        warehouse_reference: z.string().min(1),
        report_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      })
      .parse(req.body);

    // 1) On-chain: approve + mint the ERC-1155 collateral token.
    const { txHash } = await chainService.verifyCommodity({
      onChainId: body.on_chain_id,
    });

    // 2) Off-chain: mirror the new status in Supabase.
    const record = await commodityService.updateStatus(id, CommodityStatus.Verified, {
      tx_hash: txHash,
    });

    // 3) Off-chain: save the detailed verification report.
    await commodityService.createVerificationReport({
      commodity_id: id,
      inspection_reference: body.inspection_reference,
      warehouse_reference: body.warehouse_reference,
      report_hash: body.report_hash,
    });

    res.json({ record, txHash });
  },

  async reject(req: AuthedRequest, res: Response) {
    const { id } = req.params;
    const body = z
      .object({ on_chain_id: z.number().int().positive(), reason: z.string().min(1) })
      .parse(req.body);

    const { txHash } = await chainService.rejectCommodity(body.on_chain_id, body.reason);
    const record = await commodityService.updateStatus(id, CommodityStatus.Rejected, {
      tx_hash: txHash,
    });
    res.json({ record, txHash });
  },
};
