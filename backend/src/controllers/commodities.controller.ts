import type { Response } from 'express';
import { z } from 'zod';
import { commodityService } from '../services/commodity.service.js';
import { CommodityType, Grade } from '../types/index.js';
import type { AuthedRequest } from '../middleware/auth.js';

const submitSchema = z.object({
  farmer_wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid wallet address'),
  commodity_type: z.nativeEnum(CommodityType),
  grade: z.nativeEnum(Grade),
  quantity_kg: z.number().positive(),
  harvest_date: z.string(),
  storage_duration_days: z.number().int().min(1).max(730),
});

export const commoditiesController = {
  /** Farmer submits a new commodity from the frontend → saved as Pending. */
  async submit(req: AuthedRequest, res: Response) {
    const input = submitSchema.parse(req.body);
    const record = await commodityService.create(input);
    res.status(201).json(record);
  },

  /** List the signed-in farmer's submissions. */
  async listMine(req: AuthedRequest, res: Response) {
    const wallet = z.string().parse(req.query.wallet);
    const records = await commodityService.listByFarmer(wallet);
    res.json(records);
  },
};
