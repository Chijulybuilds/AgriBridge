import { CheckCircleIcon, ShieldCheckIcon, XCircleIcon } from "@heroicons/react/24/outline";

import { friendlyError, type Tx } from "../hooks/useTx";
import { activeChain } from "../lib/wagmi";

/**
 * Where a transaction is: waiting for the person, waiting for the network,
 * done, or failed (with the reason in plain words). Links to the explorer once
 * there is a transaction, so anyone can check the record.
 */
export function TxStatus({ tx, success }: { tx: Pick<Tx, "state" | "hash" | "error" | "step">; success?: string }) {
  if (tx.state === "idle") return null;

  const label =
    tx.state === "signing"
      ? `${tx.step ? `${tx.step}: ` : ""}confirm in your wallet…`
      : tx.state === "confirming"
        ? `${tx.step ? `${tx.step}: ` : ""}waiting for the network…`
        : tx.state === "confirmed"
          ? (success ?? "Done.")
          : tx.state === "proposed"
            ? "Sent to the Safe. It goes through once enough owners confirm it in Safe{Wallet}."
            : friendlyError(tx.error);

  const tone =
    tx.state === "confirmed" || tx.state === "proposed"
      ? "notice-ok"
      : tx.state === "failed"
        ? "notice-danger"
        : tx.state === "signing"
          ? "notice-warn"
          : "";
  const icon =
    tx.state === "confirmed" ? (
      <CheckCircleIcon />
    ) : tx.state === "proposed" ? (
      <ShieldCheckIcon />
    ) : tx.state === "failed" ? (
      <XCircleIcon />
    ) : (
      <span className="spinner" aria-hidden="true" />
    );
  // A Safe proposal's id is not an on-chain transaction, so there is nothing to link to yet.
  const explorer = tx.state === "proposed" ? undefined : activeChain.blockExplorers?.default.url;

  return (
    <div className={`notice ${tone}`} data-testid="tx-status" data-status={tx.state} data-step={tx.step} style={{ marginTop: 12 }}>
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>{label}</div>
        {tx.hash && explorer && (
          <a href={`${explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
            View the record on the blockchain
          </a>
        )}
      </div>
    </div>
  );
}
