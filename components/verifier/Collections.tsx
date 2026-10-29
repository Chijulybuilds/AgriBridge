import { useId, useState, type ReactNode } from "react";
import { useConnection } from "wagmi";
import { ClockIcon, TruckIcon } from "@heroicons/react/24/outline";

import { useCommodities, useLots, useWarehouses, useWithdrawalRequests, type WithdrawalRequest } from "../../hooks/useProtocolData";
import { findQueued, useSafeQueue, type CheckedTx } from "../../hooks/useSafeQueue";
import { useTx, type Tx } from "../../hooks/useTx";
import { WarehouseDeskAbi } from "../../lib/contracts/abis";
import { contracts } from "../../lib/contracts/config";
import { date, kg, parseUsd, shortAddress, textToBytes32, usd } from "../../lib/format";
import { requestAction } from "../../lib/safeQueue";
import { LotLabel, lotName } from "../lots";
import { TxStatus } from "../TxStatus";
import { Card, EmptyState, Notice, StatusBadge } from "../ui";

/**
 * Requests to take goods out of the warehouses. When the goods have left (picked
 * up, or delivered for a fee within the holder's budget), the Safe confirms the
 * release: the tokens are burned and the storage fee is paid. Or it rejects the
 * request, which refunds the holder in full.
 */
export function CollectionsTab() {
  const { requests } = useWithdrawalRequests();
  const { lots } = useLots();
  const { byId: commodities } = useCommodities();
  const { byId: warehouses } = useWarehouses();
  const lotById = new Map(lots.map((l) => [l.id, l]));
  // One status for the whole list: a request leaves it once it is handled, and the result must stay on screen.
  const tx = useTx();
  const pending = requests.filter((r) => r.status === "Pending");
  const done = requests.filter((r) => r.status !== "Pending").slice(0, 10);
  // A request already waiting in the Safe can't be released or rejected a second time: the second would revert.
  const { address } = useConnection();
  const queue = useSafeQueue(tx.viaSafe ? address : undefined);

  return (
    <div className="stack">
      <Card title={`Waiting to leave the warehouse (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState icon={TruckIcon}>No collection requests waiting.</EmptyState>
        ) : (
          <div className="stack">
            {pending.map((r) => {
              const lot = lotById.get(r.lotId);
              const warehouse = lot ? warehouses.get(lot.warehouseId)?.name : undefined;
              return (
                <CollectionItem
                  key={r.id.toString()}
                  tx={tx}
                  request={r}
                  queued={findQueued(queue.data?.queued, requestAction(r.id))}
                  label={
                    <LotLabel
                      lot={lot ?? { id: r.lotId, commodityId: 0n }}
                      commodities={commodities}
                      sub={`${kg(r.kg)} from ${warehouse ?? "the warehouse"} · for ${shortAddress(r.holder)} · asked ${date(r.requestedAt)}`}
                    />
                  }
                />
              );
            })}
          </div>
        )}
        <TxStatus tx={tx} success={tx.step === "Reject" ? "Rejected. The holder got everything back." : "Released. The storage fee is paid and the stock is off the record."} />
      </Card>
      <Card title="Recently handled">
        {done.length === 0 ? (
          <EmptyState icon={ClockIcon}>Nothing yet.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <tbody>
                {done.map((r) => (
                  <tr key={r.id.toString()}>
                    <td>
                      <strong>Request {r.id.toString()}</strong>
                      <div className="muted">{lotName(lotById.get(r.lotId) ?? { id: r.lotId, commodityId: 0n }, commodities)}</div>
                    </td>
                    <td>{kg(r.kg)}</td>
                    <td>{date(r.requestedAt)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CollectionItem({ tx, request, label, queued }: { tx: Tx; request: WithdrawalRequest; label: ReactNode; queued?: CheckedTx }) {
  const id = useId();
  const delivery = request.deliveryBudget > 0n;
  const [fee, setFee] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function release() {
    setError(null);
    const deliveryFee = delivery ? parseUsd(fee) ?? 0n : 0n;
    if (deliveryFee > request.deliveryBudget) return setError(`The fee can't be more than the budget of ${usd(request.deliveryBudget)}.`);
    try {
      await tx.send(
        { address: contracts.desk!, abi: WarehouseDeskAbi, functionName: "confirmRelease", args: [request.id, deliveryFee] },
        "Confirm release",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  async function reject() {
    setError(null);
    if (!reason.trim()) return setError("Give a short reason.");
    try {
      await tx.send(
        { address: contracts.desk!, abi: WarehouseDeskAbi, functionName: "rejectRequest", args: [request.id, textToBytes32(reason)] },
        "Reject",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <div className="card-sunken">
      <div className="spread" style={{ marginBottom: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        {label}
        <span className="row" style={{ gap: 6 }}>
          <span className="badge badge-blue">{delivery ? `Delivery, budget ${usd(request.deliveryBudget)}` : "Pickup"}</span>
          <span className="badge badge-muted badge-plain">Storage paid {usd(request.storageFee)}</span>
        </span>
      </div>
      {queued && (
        <Notice tone="info" testId="already-queued">
          Waiting in the Safe queue as #{queued.nonce} ({queued.signatures} of {queued.threshold} signed). Execute it in Safe{"{"}Wallet{"}"}, or
          reject it there to decide again.
        </Notice>
      )}
      <div className="spread" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
          {delivery && (
            <div className="field" style={{ marginBottom: 0, width: 200 }}>
              <label htmlFor={`${id}-fee`}>Actual delivery fee (US$)</label>
              <input id={`${id}-fee`} className="input" placeholder="25" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
          )}
          <button className="btn" disabled={tx.isBusy || Boolean(queued)} onClick={() => void release()}>
            Confirm the goods have left
          </button>
        </div>
        <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
          <div className="field" style={{ marginBottom: 0, width: 240 }}>
            <label htmlFor={`${id}-reason`}>Reason, if you reject it</label>
            <input
              id={`${id}-reason`}
              className="input"
              placeholder="Not collected in time"
              maxLength={32}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button className="btn btn-danger" disabled={tx.isBusy || Boolean(queued)} onClick={() => void reject()}>
            Reject and refund
          </button>
        </div>
      </div>
      {error && <p className="form-error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
