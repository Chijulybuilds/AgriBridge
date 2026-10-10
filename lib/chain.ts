import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";

import { activeChain, logsRpcUrl, rpcUrl } from "./wagmi";

/**
 * The app reads contracts through its own client rather than through the
 * signed-in wallet. Reads then work the same for visitors who are not signed
 * in, on the Safe-only /verifier page, and whichever wallet provider is active.
 *
 * Concurrent reads are grouped: into one Multicall3 call where the chain has it
 * (Sepolia), and otherwise into one JSON-RPC batch (anvil has no Multicall3;
 * viem falls back to plain calls for it).
 */
export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(rpcUrl, { batch: true }),
  batch: { multicall: true },
  // How often to check whether a transaction is mined: viem's 4s default makes every step feel slow.
  pollingInterval: activeChain.id === foundry.id ? 500 : 2_000,
});

/**
 * Reads event history (the activity feed): a separate endpoint when NEXT_PUBLIC_LOGS_RPC_URL is set.
 * Free gateways answer bursts with "429 too many requests", so it retries more patiently.
 */
export const logsClient =
  logsRpcUrl === rpcUrl
    ? publicClient
    : createPublicClient({ chain: activeChain, transport: http(logsRpcUrl, { batch: true, retryCount: 6, retryDelay: 400 }) });

/** Resolves to undefined instead of throwing, for reads that revert by design (e.g. a stale price). */
export async function orUndefined<T>(read: Promise<T>): Promise<T | undefined> {
  try {
    return await read;
  } catch {
    return undefined;
  }
}
