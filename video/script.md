# AgriBridge demo video: narration script

Generated from `src/scenes.ts`, the single source for the voice and the captions. About 7 minutes.
Voice: polished Nigerian English, warm and confident, measured pace. Captions burned in.

## 1. The problem

Every harvest, millions of farmers face the same hard choice. Sell now, when everyone is selling and prices are at their lowest, or store the crop and wait months for cash they need today. Banks rarely lend against a barn full of cocoa or rice. So the crop is sold cheap, and the value is lost. Farmers deserve a better choice.

## 2. What AgriBridge is

AgriBridge changes that. When a farmer stores crop in a partner warehouse, it is weighed, graded and recorded on the blockchain as a digital warehouse receipt. That receipt becomes money the farmer can use: a cash advance from a lending pool funded by investors, or a sale to buyers on an open market. Every step is checked by smart contracts and kept on a public record that nobody can quietly change. Let me show you how it works, step by step.

## 3. Sign in with MetaMask

Everyone signs in with MetaMask, on a computer or inside the MetaMask app on a phone. There is no account to create and no password to remember. You simply choose what you want to do first: farm, invest or buy. Your wallet is your account, and AgriBridge never holds your keys. And if you open AgriBridge in your phone's browser, one tap opens it inside the MetaMask app.

## 4. 1 · Book a delivery

Our farmer has a thousand kilograms of cocoa. On the Deliver page, she chooses the crop, the warehouse in Ibadan, the quantity and the harvest date, and books the delivery. The request is now on record, waiting for the warehouse to check it. She can follow it on her overview, marked as pending.

## 5. 2 · The warehouse verifies

At the warehouse, the crop is weighed and graded. The verifier team works in a private console that opens only inside Safe{Wallet}, the multi-signature wallet that controls AgriBridge. They enter the measured weight, the grade and the inspection reference, and approve. On the live network, every approval needs the signatures of the Safe's owners, so no single person can ever create crop out of thin air. A fingerprint of the signed inspection report is stored with the lot, so the evidence can always be checked.

## 6. 3 · Crop tokens

The moment it is approved, the farmer receives one token for every kilogram: a thousand cocoa tokens, tied to this lot, this grade and this warehouse. My Stock shows what the crop is worth today, and how its value will fall as it ages, from grade A to grade B and then grade C. And because every kilogram is its own token, she can use part of her crop and keep the rest.

## 7. 4 · A cash advance

Now the farmer needs cash. She picks an end date, sixty days from now, and AgriBridge works out the most she can borrow: up to half of what the crop will be worth on that date, because the contracts already know that stored crop loses value. Here, a thousand kilograms of cocoa, worth about $4,970 today, can back an advance of up to $2,280. She takes the advance, and the dollars arrive in her wallet in seconds. When she is ready, she repays, and her crop is released back to her.

## 8. 5 · Sell on the market

Or she can sell. She lists half of her cocoa, and offers large buyers ten per cent off orders of two hundred kilograms or more. The market page shows everything at a glance: the value of crop for sale, how much of each crop is in the warehouses, and each crop's price and how it ages.

## 9. 6 · A buyer buys and collects

A buyer, say a chocolate processor, buys two hundred kilograms. The bulk deal is applied automatically, and the tokens move to the buyer in the same transaction as the payment. To collect the goods, the buyer pays the storage fee, and the warehouse confirms the crop has left. Only then are the tokens burned, so tokens always match the crop in store. Delivery to the buyer's door is possible too, for a fee.

## 10. 7 · The investor

Who funds the advances? Investors. An investor deposits dollars into the lending pool and earns the interest farmers pay. The rate rises when more of the pool is lent out, and a share of every interest payment builds a loss cushion that protects investors first. Interest builds up every second, and investors can withdraw whenever the pool has cash available.

## 11. 8 · When prices fall

Markets move. Suppose the price of cocoa falls sharply. An advance that was safe is now at risk, because the debt has reached eighty per cent of the crop's value. AgriBridge settles it automatically: the debt is repaid from the crop, the settler earns a small reward, and anything left goes back to the farmer. If nobody else acts, AgriBridge's own keeper steps in and settles it from the loss cushion. The investors' money stays protected.

## 12. 9 · Expired stock

Crop that is never sold eventually expires. Rather than let it go to waste, the holder can sell it to AgriBridge at a fixed discount, and AgriBridge lists it for feed makers. Nothing is left behind.

## 13. Every step on the record

Every delivery, advance, sale and price change appears on the Activity page, and each one links to its transaction on the blockchain, where anyone can check it. Prices are protected too: no single source can move them, and a large jump must be confirmed before it counts. Behind the scenes, the contracts are protected against the attacks that break lending systems, and they are backed by more than two hundred and fifty automated tests.

## 14. Try it

AgriBridge is live today on the Ethereum Sepolia test network. Crop in storage becomes money farmers can use. Try it yourself at agribridge-lilac.vercel.app. Thank you for watching.

