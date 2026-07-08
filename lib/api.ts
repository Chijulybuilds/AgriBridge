import { authedFetch } from "./auth";

export interface CommodityPayload {
  type: string;
  quantity: number;
  unit: string;
  quality: string;
  location: string;
  warehouseReceipt: string;
}

export async function getMyCommodities() {
  return authedFetch("/api/commodities");
}

export async function submitCommodity(payload: CommodityPayload) {
  return authedFetch("/api/commodities", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export default {
  getMyCommodities,
  submitCommodity,
};
