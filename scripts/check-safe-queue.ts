/**
 * Prints the verifier Safe's queue and whether each number would go through if executed now, the
 * same check the /verifier console runs. Reads .env.local for the addresses.
 *
 *   npx tsx --env-file=.env.local scripts/check-safe-queue.ts
 */
import { BaseError, decodeErrorResult, type Hex } from "viem";

import { publicClient } from "../lib/chain";
import { VERIFIER_SAFE } from "../lib/contracts/config";
import { abiFor, fetchSafeQueue } from "../lib/safeQueue";

async function main() {
  if (!VERIFIER_SAFE) throw new Error("NEXT_PUBLIC_VERIFIER_SAFE is not set.");
  const { nonce, queued } = await fetchSafeQueue(VERIFIER_SAFE);
  console.log(`Next number to execute: #${nonce}. Waiting: ${queued.length}.`);
  for (const t of queued) {
    let verdict = "would go through";
    if (!t.isRejection) {
      try {
        await publicClient.call({ account: VERIFIER_SAFE, to: t.to, data: t.data, value: t.value });
      } catch (error) {
        const raw = error instanceof BaseError ? error.walk((e) => typeof (e as { data?: unknown }).data === "string") : undefined;
        const data = (raw as { data?: Hex } | undefined)?.data;
        const abi = abiFor(t.to);
        verdict = `WOULD FAIL: ${data && abi ? decodeErrorResult({ abi, data }).errorName : String(error).split("\n")[0]}`;
      }
    }
    console.log(`#${t.nonce}  ${t.label.padEnd(28)} ${t.signatures}/${t.threshold} signed  ${verdict}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
