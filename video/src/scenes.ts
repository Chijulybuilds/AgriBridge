/**
 * The demo's scenes: narration (spoken by the voiceover and burned in as captions) and the shots
 * shown while it plays. Shots from the local journey (`shots/…`) carry element boxes in
 * shots/manifest.json, which the cursor and zooms point at. Narration matches script.md.
 */
export type Shot = {
  /** Image under public/, e.g. "shots/04-deliver-form.png" or "live/00-landing.png". */
  src: string;
  /** Address shown in the browser frame. */
  url: string;
  /** Share of the scene's time this shot gets (default 1). */
  weight?: number;
  /** Manifest target the cursor glides to and clicks at the end of the shot. */
  click?: string;
  /** Manifest target the camera zooms into during the shot. */
  zoom?: string;
  /** A full-frame card instead of a browser shot. */
  card?: "title" | "flow" | "security" | "end";
};

export type Scene = { id: string; label: string; narration: string; shots: Shot[] };

const APP = "agribridge-lilac.vercel.app";

export const SCENES: Scene[] = [
  {
    id: "s01",
    label: "The problem",
    narration:
      "Every harvest, millions of farmers face the same hard choice. Sell now, when everyone is selling and prices are at their lowest, or store the crop and wait months for cash they need today. Banks rarely lend against a barn full of cocoa or rice. So the crop is sold cheap, and the value is lost. Farmers deserve a better choice.",
    shots: [{ src: "live/00-landing.png", url: APP, card: "title" }, { src: "live/00-landing.png", url: APP, weight: 1.4 }],
  },
  {
    id: "s02",
    label: "What AgriBridge is",
    narration:
      "AgriBridge changes that. When a farmer stores crop in a partner warehouse, it is weighed, graded and recorded on the blockchain as a digital warehouse receipt. That receipt becomes money the farmer can use: a cash advance from a lending pool funded by investors, or a sale to buyers on an open market. Every step is checked by smart contracts and kept on a public record that nobody can quietly change. Let me show you how it works, step by step.",
    shots: [{ src: "figures/flow.png", url: APP, card: "flow", weight: 1.3 }, { src: "live/02-how.png", url: APP }],
  },
  {
    id: "s03",
    label: "Sign in with MetaMask",
    narration:
      "Everyone signs in with MetaMask, on a computer or inside the MetaMask app on a phone. There is no account to create and no password to remember. You simply choose what you want to do first: farm, invest or buy. Your wallet is your account, and AgriBridge never holds your keys. And if you open AgriBridge in your phone's browser, one tap opens it inside the MetaMask app.",
    shots: [{ src: "shots/03-login.png", url: `${APP}/login`, click: "connect", weight: 1.4 }, { src: "shots/03-farmer-home.png", url: `${APP}/farmer`, zoom: "stats" }],
  },
  {
    id: "s04",
    label: "1 · Book a delivery",
    narration:
      "Our farmer has a thousand kilograms of cocoa. On the Deliver page, she chooses the crop, the warehouse in Ibadan, the quantity and the harvest date, and books the delivery. The request is now on record, waiting for the warehouse to check it. She can follow it on her overview, marked as pending.",
    shots: [{ src: "shots/04-deliver-form.png", url: `${APP}/farmer/deliver`, click: "submit", weight: 1.3 }, { src: "shots/04-deliver-done.png", url: `${APP}/farmer/deliver`, zoom: "deliveries" }],
  },
  {
    id: "s05",
    label: "2 · The warehouse verifies",
    narration:
      "At the warehouse, the crop is weighed and graded. The verifier team works in a private console that opens only inside Safe{Wallet}, the multi-signature wallet that controls AgriBridge. They enter the measured weight, the grade and the inspection reference, and approve. On the live network, every approval needs the signatures of the Safe's owners, so no single person can ever create crop out of thin air. A fingerprint of the signed inspection report is stored with the lot, so the evidence can always be checked.",
    shots: [
      { src: "shots/05-verify-form.png", url: `${APP}/verifier`, zoom: "item", weight: 1.2 },
      { src: "shots/05-verify-form.png", url: `${APP}/verifier`, click: "approve" },
      { src: "shots/05-verify-done.png", url: `${APP}/verifier`, weight: 0.8 },
    ],
  },
  {
    id: "s06",
    label: "3 · Crop tokens",
    narration:
      "The moment it is approved, the farmer receives one token for every kilogram: a thousand cocoa tokens, tied to this lot, this grade and this warehouse. My Stock shows what the crop is worth today, and how its value will fall as it ages, from grade A to grade B and then grade C. And because every kilogram is its own token, she can use part of her crop and keep the rest.",
    shots: [{ src: "shots/06-stock.png", url: `${APP}/stock`, zoom: "stock" }, { src: "shots/06-stock-timeline.png", url: `${APP}/stock`, zoom: "timeline" }],
  },
  {
    id: "s07",
    label: "4 · A cash advance",
    narration:
      "Now the farmer needs cash. She picks an end date, sixty days from now, and AgriBridge works out the most she can borrow: up to half of what the crop will be worth on that date, because the contracts already know that stored crop loses value. Here, a thousand kilograms of cocoa, worth about $4,970 today, can back an advance of up to $2,280. She takes the advance, and the dollars arrive in her wallet in seconds. When she is ready, she repays, and her crop is released back to her.",
    shots: [
      { src: "shots/07-advance-form.png", url: `${APP}/farmer/advance`, zoom: "max", weight: 1.2 },
      { src: "shots/07-advance-form.png", url: `${APP}/farmer/advance`, click: "submit" },
      { src: "shots/07-advance-done.png", url: `${APP}/farmer/advance`, weight: 0.7 },
      { src: "shots/07-loans.png", url: `${APP}/farmer/loans`, click: "repay" },
      { src: "shots/07-repaid.png", url: `${APP}/farmer/loans`, weight: 0.7 },
    ],
  },
  {
    id: "s08",
    label: "5 · Sell on the market",
    narration:
      "Or she can sell. She lists half of her cocoa, and offers large buyers ten per cent off orders of two hundred kilograms or more. The market page shows everything at a glance: the value of crop for sale, how much of each crop is in the warehouses, and each crop's price and how it ages.",
    shots: [{ src: "shots/08-sell-form.png", url: `${APP}/market/sell`, click: "submit" }, { src: "shots/08-market-overview.png", url: `${APP}/market`, zoom: "chart", weight: 1.3 }],
  },
  {
    id: "s09",
    label: "6 · A buyer buys and collects",
    narration:
      "A buyer, say a chocolate processor, buys two hundred kilograms. The bulk deal is applied automatically, and the tokens move to the buyer in the same transaction as the payment. To collect the goods, the buyer pays the storage fee, and the warehouse confirms the crop has left. Only then are the tokens burned, so tokens always match the crop in store. Delivery to the buyer's door is possible too, for a fee.",
    shots: [
      { src: "shots/09-market-listings.png", url: `${APP}/market`, click: "buy", weight: 0.8 },
      { src: "shots/09-buy-panel.png", url: `${APP}/market`, click: "confirm" },
      { src: "shots/09-bought.png", url: `${APP}/market`, weight: 0.6 },
      { src: "shots/09-collect-form.png", url: `${APP}/stock/collect`, click: "submit" },
      { src: "shots/09-verify-collection.png", url: `${APP}/verifier`, click: "confirm" },
      { src: "shots/09-released.png", url: `${APP}/stock/collect`, zoom: "released", weight: 0.8 },
    ],
  },
  {
    id: "s10",
    label: "7 · The investor",
    narration:
      "Who funds the advances? Investors. An investor deposits dollars into the lending pool and earns the interest farmers pay. The rate rises when more of the pool is lent out, and a share of every interest payment builds a loss cushion that protects investors first. Interest builds up every second, and investors can withdraw whenever the pool has cash available.",
    shots: [{ src: "shots/10-invest-form.png", url: `${APP}/investor`, click: "submit" }, { src: "shots/10-invested.png", url: `${APP}/investor`, zoom: "stats", weight: 1.2 }],
  },
  {
    id: "s11",
    label: "8 · When prices fall",
    narration:
      "Markets move. Suppose the price of cocoa falls sharply. An advance that was safe is now at risk, because the debt has reached eighty per cent of the crop's value. AgriBridge settles it automatically: the debt is repaid from the crop, the settler earns a small reward, and anything left goes back to the farmer. If nobody else acts, AgriBridge's own keeper steps in and settles it from the loss cushion. The investors' money stays protected.",
    shots: [
      { src: "shots/11-price-crash.png", url: `${APP}/verifier`, zoom: "price", weight: 0.9 },
      { src: "shots/11-at-risk.png", url: `${APP}/verifier`, click: "keeper", weight: 1.2 },
      { src: "shots/11-settled.png", url: `${APP}/farmer/loans`, zoom: "settled" },
    ],
  },
  {
    id: "s12",
    label: "9 · Expired stock",
    narration:
      "Crop that is never sold eventually expires. Rather than let it go to waste, the holder can sell it to AgriBridge at a fixed discount, and AgriBridge lists it for feed makers. Nothing is left behind.",
    shots: [{ src: "shots/12-clearance.png", url: `${APP}/market/clearance`, click: "sell" }, { src: "shots/12-feed-listing.png", url: `${APP}/market/clearance`, zoom: "listing" }],
  },
  {
    id: "s13",
    label: "Every step on the record",
    narration:
      "Every delivery, advance, sale and price change appears on the Activity page, and each one links to its transaction on the blockchain, where anyone can check it. Prices are protected too: no single source can move them, and a large jump must be confirmed before it counts. Behind the scenes, the contracts are protected against the attacks that break lending systems, and they are backed by more than two hundred and fifty automated tests.",
    shots: [{ src: "live/13-live-activity.png", url: `${APP}/activity` }, { src: "live/13-live-activity.png", url: `${APP}/activity`, card: "security" }],
  },
  {
    id: "s14",
    label: "Try it",
    narration:
      "AgriBridge is live today on the Ethereum Sepolia test network. Crop in storage becomes money farmers can use. Try it yourself at agribridge-lilac.vercel.app. Thank you for watching.",
    shots: [{ src: "live/14-live-market.png", url: `${APP}/market`, weight: 0.9 }, { src: "live/00-landing.png", url: APP, card: "end", weight: 1.1 }],
  },
];

/** How a written word is spoken, for the voiceover; captions show the written form. */
export const spokenWord = (word: string): string =>
  word.replace("Safe{Wallet}", "Safe Wallet").replace("agribridge-lilac.vercel.app", "agribridge-lilac dot vercel dot app");

/** The narration as sent to the voice: same words, spoken forms. */
export const spokenText = (scene: Scene) => scene.narration.split(" ").map(spokenWord).join(" ");
