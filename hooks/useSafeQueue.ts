import { useQuery } from "@tanstack/react-query";
import { BaseError, decodeErrorResult, type Address, type Hex } from "viem";

import { publicClient } from "../lib/chain";
import { abiFor, fetchSafeQueue, isSettledError, safeQueueAvailable, type QueuedTx } from "../lib/safeQueue";
import { friendlyError } from "./useTx";

export type CheckedTx = QueuedTx & {
  /** Why it would revert if executed now, in plain words. */
  problem?: string;
  /** The failure is final (the item is already settled), not just waiting for an earlier number. */
  settled?: boolean;
};

/**
 * The verifier Safe's queue, refreshed every 15 seconds. With `check`, each queued call is also run
 * as the Safe against the current state (nothing is sent), so the console can tell which number
 * would fail before an owner presses Execute.
 */
export function useSafeQueue(safe: Address | undefined, { check = true } = {}) {
  return useQuery({
    queryKey: ["safe-queue", safe, check],
    enabled: Boolean(safe && safeQueueAvailable),
    refetchInterval: 15_000,
    queryFn: async () => {
      const queue = await fetchSafeQueue(safe!);
      const queued: CheckedTx[] = check
        ? await Promise.all(
            queue.queued.map(async (t) => {
              const reason = await revertReason(safe!, t);
              return reason ? { ...t, problem: friendlyError(new Error(reason)), settled: isSettledError(reason) } : t;
            }),
          )
        : queue.queued;

      // A later number that settles an item an earlier number already settles can only fail.
      const first = new Map<string, number>();
      for (const t of queued) {
        if (!t.action || t.isRejection) continue;
        const earlier = first.get(t.action);
        if (earlier === undefined) first.set(t.action, t.nonce);
        else if (earlier < t.nonce) {
          t.problem = `It repeats #${earlier}, so it fails once #${earlier} runs.`;
          t.settled = true;
        }
      }
      return { nonce: queue.nonce, queued };
    },
  });
}

/** The queued proposal (not a rejection) that settles `action`, if there is one. */
export function findQueued(queued: CheckedTx[] | undefined, action: string): CheckedTx | undefined {
  return queued?.find((t) => t.action === action && !t.isRejection);
}

/** The contract error a queued call would revert with right now, or undefined if it would succeed. */
async function revertReason(safe: Address, t: QueuedTx): Promise<string | undefined> {
  if (t.isRejection) return undefined;
  try {
    await publicClient.call({ account: safe, to: t.to, data: t.data, value: t.value });
    return undefined;
  } catch (error) {
    const raw = error instanceof BaseError ? error.walk((e) => typeof (e as { data?: unknown }).data === "string") : undefined;
    const data = (raw as { data?: Hex } | undefined)?.data;
    const abi = abiFor(t.to);
    if (data && abi) {
      try {
        return decodeErrorResult({ abi, data }).errorName;
      } catch {
        // Not one of the contract's own errors: fall through to the message.
      }
    }
    return error instanceof Error ? error.message : String(error);
  }
}
