import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection, useSendTransaction, useSwitchChain, useWriteContract } from "wagmi";
import { encodeFunctionData, type Address, type Hash } from "viem";

import { CommodityTokenAbi, ERC20Abi } from "../lib/contracts/abis";
import { contracts } from "../lib/contracts/config";
import { publicClient } from "../lib/chain";
import { decode, fetchSafeQueue, safeQueueAvailable } from "../lib/safeQueue";
import { activeChain } from "../lib/wagmi";

/** "proposed": sent to the Safe, which executes it once enough owners confirm in Safe{Wallet}. */
export type TxState = "idle" | "signing" | "confirming" | "confirmed" | "proposed" | "failed";

/**
 * Sends contract transactions and follows each one to its receipt.
 *
 * `send` puts the wallet on the app's network if needed, submits the call, and
 * resolves only once the transaction is mined, then refreshes every screen's
 * data. `ensureUsdc` and `ensureCropApproval` ask for an approval only when one
 * is missing, so a person sees one extra step at most, and only the first time.
 */
export function useTx() {
  const { mutateAsync: writeContract } = useWriteContract();
  const { mutateAsync: sendTransaction } = useSendTransaction();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { address, chainId, connector } = useConnection();
  const queryClient = useQueryClient();
  // Inside Safe{Wallet}, a "transaction" is a proposal the owners still have to confirm.
  const viaSafe = connector?.id === "safe";

  const [state, setState] = useState<TxState>("idle");
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<Error | null>(null);
  const [step, setStep] = useState<string>();
  // Set after a Safe proposal that the next one depends on (an approval queued before a top-up).
  const queuedAhead = useRef(false);

  type Request = Parameters<typeof writeContract>[0];

  /**
   * `intermediate` marks a step that another one follows straight away (an
   * approval before the action): it never shows "done", so nobody mistakes the
   * approval for the result.
   */
  const send = useCallback(
    async (request: Request, label?: string, intermediate = false): Promise<Hash> => {
      setError(null);
      setHash(undefined);
      setStep(label);
      setState("signing");
      try {
        if (chainId !== activeChain.id) await switchChain({ chainId: activeChain.id });
        if (viaSafe) {
          const dependsOnQueued = queuedAhead.current;
          queuedAhead.current = false;
          await checkSafeProposal(request, address!, dependsOnQueued);
        }
        // Simulate first: a call that would fail shows its reason before any wallet prompt. The gas
        // limit gets 30% headroom, because by the time the transaction is mined the pool may have
        // interest to accrue first, which a node's exact estimate didn't include. (The Safe sets
        // its own gas when the owners execute, so it is left alone.)
        const estimate = viaSafe
          ? undefined
          : await publicClient.estimateContractGas({
              ...(request as Parameters<typeof publicClient.estimateContractGas>[0]),
              account: address,
            });
        const gas = estimate === undefined ? undefined : (estimate * 13n) / 10n + 20_000n;
        // Passing chainId makes the wallet refuse to send anywhere else.
        const txHash = await writeContract({ ...request, chainId: activeChain.id, ...(gas ? { gas } : {}) } as Request);
        setHash(txHash);
        if (viaSafe) {
          // The hash is the Safe's own transaction id, not an on-chain one: nothing to wait for here.
          queuedAhead.current = intermediate;
          setState("proposed");
          void queryClient.invalidateQueries({ queryKey: ["safe-queue"] });
          return txHash;
        }
        setState("confirming");
        // viem returns the receipt of a reverted transaction rather than throwing.
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status === "reverted") throw new Error(`The transaction was reverted on-chain (${txHash}).`);
        if (intermediate) {
          setStep("Next step");
          setState("signing");
          return txHash;
        }
        setState("confirmed");
        await queryClient.invalidateQueries();
        return txHash;
      } catch (err) {
        const display = toDisplayError(err);
        setError(display);
        setState("failed");
        throw display;
      }
    },
    [address, chainId, switchChain, writeContract, queryClient, viaSafe],
  );

  /**
   * Sends `value` wei of ETH to `to`, with the same steps and status as `send`. The transfer is
   * checked against the balance first, so one it can't cover fails before the wallet opens.
   */
  const sendEth = useCallback(
    async (to: Address, value: bigint, label?: string): Promise<Hash> => {
      setError(null);
      setHash(undefined);
      setStep(label);
      setState("signing");
      try {
        if (chainId !== activeChain.id) await switchChain({ chainId: activeChain.id });
        // The estimate is passed on, with the same headroom as `send`: a transfer no longer costs a
        // fixed 21,000 gas on every network (on Sepolia, sending to a new, empty address costs about
        // ten times that), and a wallet that assumes 21,000 sends one that runs out of gas.
        const estimate = await publicClient.estimateGas({ account: address, to, value });
        const gas = (estimate * 13n) / 10n + 20_000n;
        const txHash = await sendTransaction({ to, value, gas, chainId: activeChain.id });
        setHash(txHash);
        setState("confirming");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status === "reverted") throw new Error(`The transaction was reverted on-chain (${txHash}).`);
        setState("confirmed");
        await queryClient.invalidateQueries();
        return txHash;
      } catch (err) {
        const display = toDisplayError(err);
        setError(display);
        setState("failed");
        throw display;
      }
    },
    [address, chainId, switchChain, sendTransaction, queryClient],
  );

  /** Lets `spender` take `amount` USDC from the connected account, if it may not already. */
  const ensureUsdc = useCallback(
    async (spender: Address, amount: bigint) => {
      const usdc = contracts.usdc;
      if (!usdc || !address) throw new Error("Sign in first.");
      const allowance = await publicClient.readContract({
        address: usdc,
        abi: ERC20Abi,
        functionName: "allowance",
        args: [address, spender],
      });
      if (allowance >= amount) return;
      await send({ address: usdc, abi: ERC20Abi, functionName: "approve", args: [spender, amount] }, "Allow the payment", true);
    },
    [address, send],
  );

  /** Lets `operator` (pool, market or warehouse desk) move the account's crop tokens, if it may not already. */
  const ensureCropApproval = useCallback(
    async (operator: Address) => {
      const token = contracts.token;
      if (!token || !address) throw new Error("Sign in first.");
      const approved = await publicClient.readContract({
        address: token,
        abi: CommodityTokenAbi,
        functionName: "isApprovedForAll",
        args: [address, operator],
      });
      if (approved) return;
      await send(
        { address: token, abi: CommodityTokenAbi, functionName: "setApprovalForAll", args: [operator, true] },
        "Allow AgriBridge to hold your crop",
        true,
      );
    },
    [address, send],
  );

  const reset = useCallback(() => {
    setState("idle");
    setHash(undefined);
    setError(null);
    setStep(undefined);
  }, []);

  return {
    send,
    sendEth,
    ensureUsdc,
    ensureCropApproval,
    viaSafe,
    state,
    hash,
    error,
    step,
    isBusy: state === "signing" || state === "confirming",
    reset,
  };
}

export type Tx = ReturnType<typeof useTx>;

/**
 * Stops a Safe proposal that could only fail when the owners execute it. It is run as the Safe
 * against the current state first (unless it depends on a proposal queued just before it, which
 * hasn't run yet), and refused if the same delivery, collection or listing is already waiting in
 * the Safe's queue: of two proposals that settle one item, the second always reverts (GS013).
 */
async function checkSafeProposal(request: { address: Address; abi: unknown; functionName: string; args?: readonly unknown[] }, safe: Address, dependsOnQueued: boolean) {
  if (!dependsOnQueued) {
    await publicClient.simulateContract({ ...(request as Parameters<typeof publicClient.simulateContract>[0]), account: safe });
  }
  if (!safeQueueAvailable) return;
  const action = decode(request.address, encodeFunctionData(request as Parameters<typeof encodeFunctionData>[0]))?.action;
  if (!action) return;
  let queued;
  try {
    ({ queued } = await fetchSafeQueue(safe));
  } catch {
    return; // The queue service being down shouldn't stop the warehouse; the simulation above still ran.
  }
  const waiting = queued.find((t) => t.action === action && !t.isRejection);
  if (waiting) {
    throw new Error(
      `This is already in the Safe queue as #${waiting.nonce} (${waiting.signatures} of ${waiting.threshold} signed). Execute or reject that one in Safe{Wallet}.`,
    );
  }
}

/**
 * Keeps only what the screens show from a wallet or contract error.
 *
 * viem errors carry the call's arguments, usually bigints, and React's dev-only
 * performance tracks JSON.stringify props, which throws on bigints.
 */
export function toDisplayError(error: unknown): Error {
  if (error instanceof Error) {
    const display = new Error(error.message);
    display.name = error.name;
    return display;
  }
  return new Error(String(error));
}

/** Contract errors in plain words. Anything unknown falls back to the error's own name. */
const PLAIN_ERRORS: Record<string, string> = {
  CommodityRegistry__CommodityNotActive: "This crop is not being accepted right now.",
  CommodityRegistry__InvalidHarvestDate: "The harvest date can't be in the future.",
  CommodityRegistry__InvalidQuantity: "Enter a quantity above zero.",
  CommodityRegistry__InvalidStatus: "This delivery is no longer waiting: it was already handled or cancelled.",
  CommodityRegistry__MissingEvidence: "Add the inspection report before approving.",
  CommodityRegistry__NotLotFarmer: "Only the farmer who booked this delivery can do that.",
  CommodityRegistry__OverCapacity: "That warehouse doesn't have room for this much.",
  CommodityRegistry__WarehouseUnavailable: "That warehouse isn't taking deliveries right now.",
  CommodityRegistry__WarehouseNotFound: "That warehouse doesn't exist.",
  CommodityToken__LotFrozen: "This lot is frozen by the regulator.",
  CommodityPriceOracle__PriceStale: "The price for this crop is out of date. Try again once it's updated.",
  CommodityPriceOracle__PriceFeedInactive: "There's no price for this crop yet.",
  CommodityPriceOracle__NotReporter: "Only approved price reporters can send reports.",
  CommodityPriceOracle__OverrideOnlyWhilePaused: "Pause prices before overriding a live price.",
  CommodityPriceOracle__CoolingOff: "Prices can resume one hour after the last override, so borrowers can react first.",
  CommodityPriceOracle__InvalidPrice: "Enter a price between $0.01 and $1,000,000 per kg.",
  CommodityPriceOracle__WrongPriceSource: "This crop's price comes from the local reporters, not from here.",
  CommodityConfig__InvalidLiquidationBonus:
    "The settlement reward must be above 0% and at most 15%, and the crop must still cover it at the point of settlement.",
  LendingPool__ExceedsMaxLTV: "That's more than this crop can borrow by the end date you chose.",
  LendingPool__InsufficientPoolCash: "The pool doesn't have that much available right now.",
  LendingPool__InsufficientCollateralBalance: "You don't hold that many kilograms of this lot.",
  LendingPool__InvalidMaturity: "Choose an end date at least a day away and a month before the crop expires.",
  LendingPool__InvalidLoanBounds: "Advances must be between ₦37,500 ($25) and ₦15 billion ($10 million).",
  LendingPool__InsufficientWelcomeFund: "The welcome fund doesn't hold that much.",
  LendingPool__CommodityNotApprovedForBorrowing: "This lot can't be borrowed against (not verified, frozen or expired).",
  LendingPool__LotFrozen: "This lot is frozen by the regulator.",
  LendingPool__LoanNotActive: "This loan is already closed.",
  LendingPool__PositionHealthy: "This loan is healthy, so it can't be liquidated.",
  LendingPool__RepayLimitTooLow: "Settling this advance in full costs more than the limit you set.",
  LendingPool__SameBlockWithdrawal: "Wait a moment after depositing before withdrawing.",
  LendingPool__ZeroAmount: "Enter an amount above zero.",
  Marketplace__InvalidPrice: "Check the price: it must be above zero, and a bulk deal needs a minimum order and at most 50% off.",
  Marketplace__InvalidAmount: "Enter an amount the listing can cover.",
  Marketplace__LotNotTradable: "This lot can't be traded (frozen, expired or not verified).",
  Marketplace__LotNotExpired: "Only expired stock can be sold to AgriBridge.",
  Marketplace__ListingNotActive: "This listing is sold out or closed.",
  Marketplace__NotSeller: "Only the seller can change this listing.",
  Marketplace__PriceAboveLimit: "The price moved since you looked. Check the new total and try again.",
  Marketplace__InsufficientClearanceFund: "AgriBridge's clearance fund is too low for this right now.",
  Marketplace__InsufficientInventory: "There isn't that much cleared stock to list.",
  WarehouseDesk__InvalidAmount: "Enter a quantity you hold.",
  WarehouseDesk__LotFrozen: "This lot is frozen by the regulator.",
  WarehouseDesk__LotNotVerified: "Only verified stock can be collected.",
  WarehouseDesk__NotHolder: "Only the person who asked can cancel this.",
  WarehouseDesk__NotPending: "This request is no longer waiting: it was already handled or cancelled.",
  WarehouseDesk__DeliveryOverBudget: "The delivery fee is above the buyer's budget.",
};

/** The part of a wallet or contract error a person can act on. */
export function friendlyError(error: Error | null | undefined): string {
  if (!error) return "Something went wrong.";
  const message = error.message ?? "";

  if (/user rejected|user denied|rejected the request/i.test(message)) return "You cancelled the request.";
  if (/insufficient funds/i.test(message)) return "Not enough funds to pay the network fee.";
  if (/ERC20InsufficientBalance|transfer amount exceeds balance/i.test(message)) return "You don't have enough dollars for this.";
  if (/ERC20InsufficientAllowance/i.test(message)) return "The payment wasn't approved. Try again.";
  if (/ERC1155InsufficientBalance/i.test(message)) return "You don't hold that many kilograms.";
  if (/AccessControlUnauthorizedAccount/i.test(message)) return "This wallet isn't allowed to do that.";
  if (/EnforcedPause/i.test(message)) return "AgriBridge is paused for safety. Try again later.";
  if (/chain.*not configured|ChainNotConfigured/i.test(message)) return `Your wallet can't reach ${activeChain.name}.`;

  const custom = message.match(/([A-Za-z0-9]+__[A-Za-z]+)/);
  if (custom) {
    return PLAIN_ERRORS[custom[1]] ?? custom[1].replace(/^[A-Za-z0-9]+__/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  }
  return message.split("\n")[0].slice(0, 160);
}
