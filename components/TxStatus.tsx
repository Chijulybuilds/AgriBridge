import { activeChain } from "../lib/wagmi";

type Props = {
  status: string;
  hash?: `0x${string}`;
  error?: Error | null;
  idleMessage?: string;
};

const palette: Record<string, { bg: string; fg: string }> = {
  signing: { bg: "#fff8e1", fg: "#8d6e00" },
  confirming: { bg: "#e3f2fd", fg: "#0d47a1" },
  confirmed: { bg: "#e8f5e9", fg: "#1b5e20" },
  failed: { bg: "#fdecea", fg: "#b71c1c" },
};

/**
 * Reports where a transaction is in its lifecycle, and links to the explorer
 * once there is a hash. Users otherwise have no signal between signing and
 * confirmation, which on Sepolia can be many seconds.
 */
export function TxStatus({ status, hash, error, idleMessage }: Props) {
  if (status === "idle") {
    return idleMessage ? (
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{idleMessage}</p>
    ) : null;
  }

  const label =
    status === "signing"
      ? "Confirm in your wallet…"
      : status === "confirming"
        ? "Waiting for confirmation…"
        : status === "confirmed"
          ? "Transaction confirmed"
          : friendlyError(error);

  const colours = palette[status] ?? palette.failed;
  const explorer = activeChain.blockExplorers?.default.url;

  return (
    <div
      data-testid="tx-status"
      data-status={status}
      style={{
        background: colours.bg,
        color: colours.fg,
        padding: "10px 12px",
        borderRadius: 10,
        fontSize: 13,
        marginTop: 12,
        lineHeight: 1.5,
      }}
    >
      <div>{label}</div>
      {hash && explorer && (
        <a
          href={`${explorer}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: colours.fg, textDecoration: "underline", fontSize: 12 }}
        >
          View on explorer
        </a>
      )}
    </div>
  );
}

/**
 * Wallet and RPC errors are long and mostly noise. Surface the part a user can
 * act on, and keep the full text in the console for debugging.
 */
export function friendlyError(error: Error | null | undefined): string {
  if (!error) return "Transaction failed";
  const message = error.message ?? "";

  if (/user rejected|user denied/i.test(message)) return "You declined the transaction.";
  if (/insufficient funds/i.test(message)) return "Not enough ETH to cover gas.";
  if (/ExceedsMaxLTV/i.test(message)) return "Borrow amount exceeds the 70% loan-to-value limit.";
  if (/PriceStale/i.test(message)) return "The price feed is stale. Try again shortly.";
  if (/PriceFeedInactive/i.test(message)) return "No price feed is active for this commodity.";
  if (/InsufficientPoolCash/i.test(message)) return "The pool does not have enough liquidity right now.";
  if (/RepaymentExceedsDebt/i.test(message)) return "That is more than the outstanding debt.";
  if (/NotApprovedForBorrowing/i.test(message)) return "This commodity has not been verified yet.";
  if (/ERC20InsufficientAllowance|allowance/i.test(message)) return "Approve the token spend first.";
  if (/ERC20InsufficientBalance/i.test(message)) return "Insufficient token balance.";

  // Contract custom errors surface as `Error: SomeName()`; show just the name.
  const custom = message.match(/([A-Za-z]+__[A-Za-z]+)\(/);
  if (custom) return custom[1].replace(/^[A-Za-z]+__/, "").replace(/([a-z])([A-Z])/g, "$1 $2");

  return message.split("\n")[0].slice(0, 160);
}
