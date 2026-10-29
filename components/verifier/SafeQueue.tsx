import type { Address } from "viem";

import { useSafeQueue, type CheckedTx } from "../../hooks/useSafeQueue";
import { Card, Notice } from "../ui";

/**
 * What is waiting in the Safe, in the order it will run, and whether each number would go through
 * if executed now. A Safe executes strictly in order, so one transaction that reverts holds up
 * every number after it until the owners replace it with a rejection; this says which one, and how.
 */
export function SafeQueuePanel({ safe }: { safe: Address }) {
  const { data, isError } = useSafeQueue(safe);
  if (isError) {
    return (
      <Notice tone="warn" testId="safe-queue-unavailable">
        The Safe queue can&apos;t be read right now, so this page can&apos;t warn about duplicates. Check the queue in Safe{"{"}Wallet{"}"} before
        executing.
      </Notice>
    );
  }
  if (!data || data.queued.length === 0) return null;

  const { nonce, queued } = data;
  const next = queued.filter((t) => t.nonce === nonce);
  const blocker = next.find((t) => !t.isRejection && t.problem);
  const blockerRejection = next.find((t) => t.isRejection);
  const behind = new Set(queued.filter((t) => t.nonce > nonce).map((t) => t.nonce)).size;
  const laterFailures = queued.filter((t) => t.nonce > nonce && !t.isRejection && t.settled);

  return (
    <Card title={`Waiting in the Safe (${new Set(queued.map((t) => t.nonce)).size})`} testId="safe-queue">
      {blocker ? (
        <Notice tone="danger" testId="safe-queue-blocked">
          <strong>
            #{blocker.nonce} {blocker.label} will fail.
          </strong>{" "}
          {blocker.problem}
          {behind > 0 && ` Until it is cleared, the ${behind === 1 ? "number" : `${behind} numbers`} after it can't run.`}
          <br />
          {blockerRejection
            ? blockerRejection.signatures >= blockerRejection.threshold
              ? `A rejection for #${blocker.nonce} is signed: execute the rejection (not the original) in Safe{Wallet}.`
              : `A rejection for #${blocker.nonce} is waiting (${blockerRejection.signatures} of ${blockerRejection.threshold} signed): the other owner signs it, then execute it.`
            : `In Safe{Wallet}, open #${blocker.nonce} in Transactions → Queue and press Reject. Once both owners sign the rejection, execute it.`}
        </Notice>
      ) : (
        next.some((t) => !t.isRejection && t.signatures >= t.threshold) && (
          <Notice tone="ok">#{nonce} is signed and will go through: execute it in Safe{"{"}Wallet{"}"}.</Notice>
        )
      )}
      {laterFailures.length > 0 && (
        <Notice tone="warn" testId="safe-queue-later">
          {laterFailures.map((t) => {
            const rejection = queued.find((r) => r.isRejection && r.nonce === t.nonce);
            return (
              <span key={t.safeTxHash} style={{ display: "block" }}>
                <strong>
                  #{t.nonce} {t.label}
                </strong>{" "}
                will fail too: {t.problem}{" "}
                {rejection
                  ? `Its rejection is waiting (${rejection.signatures} of ${rejection.threshold} signed): sign it, then execute the rejection.`
                  : "Reject it as well."}
              </span>
            );
          })}
        </Notice>
      )}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>No.</th>
              <th>What it does</th>
              <th>Signed</th>
              <th>If executed now</th>
            </tr>
          </thead>
          <tbody>
            {queued.map((t) => (
              <tr key={t.safeTxHash} data-testid={`safe-queue-${t.nonce}`}>
                <td className="num">#{t.nonce}</td>
                <td>{t.label}</td>
                <td className="num">
                  {t.signatures} of {t.threshold}
                </td>
                <td>
                  <QueueStatus tx={t} next={nonce} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function QueueStatus({ tx, next }: { tx: CheckedTx; next: number }) {
  if (tx.isRejection) return <span className="badge badge-muted">Cancels #{tx.nonce}</span>;
  if (tx.problem && (tx.nonce === next || tx.settled)) {
    return (
      <span className="badge badge-red" title={tx.problem}>
        Will fail: reject it
      </span>
    );
  }
  if (tx.signatures < tx.threshold) {
    const missing = tx.threshold - tx.signatures;
    return <span className="badge badge-gold">Needs {missing === 1 ? "1 more signature" : `${missing} more signatures`}</span>;
  }
  if (tx.nonce === next) return <span className="badge badge-green">Ready to execute</span>;
  return <span className="badge badge-blue">Runs after #{tx.nonce - 1}</span>;
}
