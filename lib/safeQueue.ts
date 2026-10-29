import { decodeFunctionData, getAddress, parseAbi, type Abi, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";

import {
  CommodityConfigAbi,
  CommodityPriceOracleAbi,
  CommodityRegistryAbi,
  ERC20Abi,
  LendingPoolAbi,
  LiquidationKeeperAbi,
  MarketplaceAbi,
  WarehouseDeskAbi,
} from "./contracts/abis";
import { contracts } from "./contracts/config";
import { publicClient } from "./chain";
import { activeChain } from "./wagmi";

/**
 * The verifier Safe's queue: transactions the owners have proposed but not yet executed.
 *
 * A Safe runs its transactions strictly in nonce order, each against the state left by the one
 * before. A proposal can therefore be fine when it is made and still revert (GS013) when it is
 * finally executed: the same delivery approved twice, or a delivery the farmer cancelled while
 * the approval waited for signatures. And one that reverts holds up every number after it. The
 * console reads the queue from Safe's transaction service so it can refuse to propose an action
 * that is already waiting, and say which queued number will fail before anyone presses Execute.
 */

/** Safe's public transaction service, per chain. A local chain has none, and the queue reads as empty. */
const TX_SERVICE: Partial<Record<number, string>> = {
  [sepolia.id]: "https://api.safe.global/tx-service/sep",
};

export const safeQueueAvailable = Boolean(TX_SERVICE[activeChain.id]);

const SAFE_ABI = parseAbi(["function nonce() view returns (uint256)"]);

export type QueuedTx = {
  nonce: number;
  safeTxHash: Hex;
  to: Address;
  data?: Hex;
  value: bigint;
  signatures: number;
  threshold: number;
  /** The Safe's "Reject" for a number: an empty call to itself, which uses the number up without doing anything. */
  isRejection: boolean;
  /** What it does, in plain words. */
  label: string;
  /** The single item it settles (see `lotAction`), when it settles one: two of those for one item can't both succeed. */
  action?: string;
};

export type SafeQueue = {
  /** The next number the Safe will execute. */
  nonce: number;
  queued: QueuedTx[];
};

type ServiceTx = {
  nonce: number;
  safeTxHash: Hex;
  to: Address;
  data: Hex | null;
  value: string;
  confirmationsRequired: number;
  confirmations: unknown[] | null;
};

/** Every proposal still waiting at or after the Safe's current number, in the order they will run. */
export async function fetchSafeQueue(safe: Address): Promise<SafeQueue> {
  const service = TX_SERVICE[activeChain.id];
  if (!service) return { nonce: 0, queued: [] };
  const nonce = Number(await publicClient.readContract({ address: safe, abi: SAFE_ABI, functionName: "nonce" }));
  // Proposals below the current number were replaced by a rejection and can never run, so they are left out.
  const response = await fetch(
    `${service}/api/v1/safes/${getAddress(safe)}/multisig-transactions/?executed=false&nonce__gte=${nonce}&ordering=nonce&limit=100`,
  );
  if (!response.ok) throw new Error(`The Safe queue is unavailable (${response.status}).`);
  const { results } = (await response.json()) as { results: ServiceTx[] };

  const queued = results
    .filter((t) => t.nonce >= nonce)
    .map((t): QueuedTx => {
      const data = t.data && t.data !== "0x" ? t.data : undefined;
      const isRejection = !data && BigInt(t.value) === 0n && t.to.toLowerCase() === safe.toLowerCase();
      const decoded = data ? decode(t.to, data) : undefined;
      return {
        nonce: t.nonce,
        safeTxHash: t.safeTxHash,
        to: t.to,
        data,
        value: BigInt(t.value),
        signatures: t.confirmations?.length ?? 0,
        threshold: t.confirmationsRequired,
        isRejection,
        label: isRejection ? "Rejection: uses up this number" : (decoded?.label ?? "Contract call"),
        action: decoded?.action,
      };
    })
    .sort((a, b) => a.nonce - b.nonce);
  return { nonce, queued };
}

/** The key for "this delivery (lot) is being approved or rejected". */
export const lotAction = (lotId: bigint) => `lot:${lotId}`;
/** The key for "this collection request is being released or rejected". */
export const requestAction = (requestId: bigint) => `request:${requestId}`;

/** The verifier's contracts, so a queued call can be named and checked. */
function targets(): { address?: Address; abi: Abi }[] {
  return [
    { address: contracts.registry, abi: CommodityRegistryAbi },
    { address: contracts.desk, abi: WarehouseDeskAbi },
    { address: contracts.marketplace, abi: MarketplaceAbi },
    { address: contracts.pool, abi: LendingPoolAbi },
    { address: contracts.keeper, abi: LiquidationKeeperAbi },
    { address: contracts.oracle, abi: CommodityPriceOracleAbi },
    { address: contracts.config, abi: CommodityConfigAbi },
    { address: contracts.usdc, abi: ERC20Abi },
  ];
}

export function abiFor(to: Address): Abi | undefined {
  return targets().find((t) => t.address?.toLowerCase() === to.toLowerCase())?.abi;
}

/** Names a call and, if it settles one item, which. */
export function decode(to: Address, data: Hex): { functionName: string; args: readonly unknown[]; label: string; action?: string } | undefined {
  const abi = abiFor(to);
  if (!abi) return undefined;
  try {
    const { functionName, args = [] } = decodeFunctionData({ abi, data });
    const id = typeof args[0] === "bigint" ? args[0] : undefined;
    const target = to.toLowerCase();
    let label = functionName.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    label = label.charAt(0).toUpperCase() + label.slice(1);
    let action: string | undefined;

    if (target === contracts.registry?.toLowerCase() && id !== undefined) {
      if (functionName === "approveIntake") [label, action] = [`Approve delivery #${id}`, lotAction(id)];
      if (functionName === "rejectIntake") [label, action] = [`Reject delivery #${id}`, lotAction(id)];
    } else if (target === contracts.desk?.toLowerCase() && id !== undefined) {
      if (functionName === "confirmRelease") [label, action] = [`Confirm collection #${id}`, requestAction(id)];
      if (functionName === "rejectRequest") [label, action] = [`Reject collection #${id}`, requestAction(id)];
    } else if (target === contracts.marketplace?.toLowerCase() && functionName === "cancel" && id !== undefined) {
      [label, action] = [`Take down listing #${id}`, `listing:${id}`];
    } else if (target === contracts.oracle?.toLowerCase() && (functionName === "pause" || functionName === "unpause")) {
      [label, action] = [functionName === "pause" ? "Pause prices" : "Resume prices", `oracle:${functionName}`];
    }
    return { functionName, args, label, action };
  } catch {
    return undefined;
  }
}

/**
 * Errors that mean the item was already settled: the call can never succeed again, whatever runs
 * before it. Any other failure of a later number may only be waiting for an earlier one (a top-up
 * waits for its approval), so it is judged when that number is next in line.
 */
export function isSettledError(reason: string): boolean {
  return /__(InvalidStatus|NotPending|ListingNotActive|LoanNotActive)\b/.test(reason);
}
