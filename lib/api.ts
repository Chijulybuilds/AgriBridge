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
  // Map type to backend CommodityType enum
  let commodity_type = "Cocoa";
  const typeLower = payload.type.toLowerCase();
  if (typeLower.includes("cocoa")) {
    commodity_type = "Cocoa";
  } else if (typeLower.includes("rice")) {
    commodity_type = "Rice";
  } else if (typeLower.includes("maize")) {
    commodity_type = "Maize";
  } else if (typeLower.includes("cashew")) {
    commodity_type = "Cashew";
  } else if (typeLower.includes("yam")) {
    commodity_type = "Yam";
  } else {
    // default/fallback to a valid enum option
    commodity_type = "Cocoa";
  }

  // Map quality to backend Grade enum (A, B, C)
  let grade = "A";
  const qualLower = payload.quality.toLowerCase();
  if (qualLower.includes("a")) {
    grade = "A";
  } else if (qualLower.includes("b")) {
    grade = "B";
  } else if (qualLower.includes("c")) {
    grade = "C";
  }

  // Normalize quantity in kg
  let quantity_kg = payload.quantity;
  if (payload.unit.toLowerCase().includes("tonne")) {
    quantity_kg = payload.quantity * 1000;
  }

  // Pre-fill valid harvest date and storage duration
  const harvest_date = new Date().toISOString().split("T")[0];
  const storage_duration_days = 180;

  const backendPayload = {
    commodity_type,
    grade,
    quantity_kg,
    harvest_date,
    storage_duration_days,
  };

  return authedFetch("/api/commodities", {
    method: "POST",
    body: JSON.stringify(backendPayload),
  });
}

export async function getVerifierQueue() {
  return authedFetch("/api/verifier/queue");
}

export async function approveCommodity(
  id: string,
  payload: {
    on_chain_id: number;
    inspection_reference: string;
    warehouse_reference: string;
    report_hash: string;
  }
) {
  return authedFetch(`/api/verifier/commodities/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectCommodity(
  id: string,
  payload: {
    on_chain_id: number;
    reason: string;
  }
) {
  return authedFetch(`/api/verifier/commodities/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export default {
  getMyCommodities,
  submitCommodity,
  getVerifierQueue,
  approveCommodity,
  rejectCommodity,
};
