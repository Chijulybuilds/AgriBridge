import type { Response } from 'express';
import { z } from 'zod';
import { commodityService } from '../services/commodity.service.js';
import { CommodityType, Grade } from '../types/index.js';
import type { AuthedRequest } from '../middleware/auth.js';

const submitSchema = z.object({
  commodity_type: z.nativeEnum(CommodityType),
  grade: z.nativeEnum(Grade),
  quantity_kg: z.number().positive(),
  harvest_date: z.string(),
  storage_duration_days: z.number().int().min(1).max(730),
});

export const commoditiesController = {
  /** Farmer submits a new commodity → saved as Pending, owned by their wallet. */
  async submit(req: AuthedRequest, res: Response) {
    const input = submitSchema.parse(req.body);
    // The owner is always the authenticated wallet — never trust a body field.
    const record = await commodityService.create({ ...input, farmer_wallet: req.user!.wallet });
    res.status(201).json(record);
  },

  /** List the signed-in farmer's own submissions. */
  async listMine(req: AuthedRequest, res: Response) {
    const records = await commodityService.listByFarmer(req.user!.wallet);
    res.json(records);
  },
};
