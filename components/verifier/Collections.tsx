import { useState } from "react";

import { useCommodities, useLots, useWarehouses, useWithdrawalRequests, type WithdrawalRequest } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { WarehouseDeskAbi } from "../../lib/contracts/abis";
import { contracts } from "../../lib/contracts/config";
import { date, kg, parseUsd, shortAddress, textToBytes32, usd } from "../../lib/format";
import { lotName } from "../lots";
import { TxStatus } from "../TxStatus";
import { Card, EmptyState, StatusBadge } from "../ui";

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
  const pending = requests.filter((r) => r.status === "Pending");
  const done = requests.filter((r) => r.status !== "Pending").slice(0, 10);

  return (
    <div className="stack">
      <Card title={`Waiting to leave the warehouse (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState>No collection requests waiting.</EmptyState>
        ) : (
          <div className="stack">
            {pending.map((r) => {
              const lot = lotById.get(r.lotId);
              return (
                <CollectionItem
                  key={r.id.toString()}
                  request={r}
                  name={lot ? lotName(lot, commodities) : `Lot ${r.lotId}`}
                  warehouse={lot ? warehouses.get(lot.warehouseId)?.name : undefined}
                />
              );
            })}
          </div>
        )}
      </Card>
      <Card title="Recently handled">
        {done.length === 0 ? (
          <EmptyState>Nothing yet.</EmptyState>
        ) : (
          <table className="table">
            <tbody>
              {done.map((r) => (
                <tr key={r.id.toString()}>
                  <td>Request {r.id.toString()}</td>
                  <td>{kg(r.kg)}</td>
                  <td>{date(r.requestedAt)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function CollectionItem({ request, name, warehouse }: { request: WithdrawalRequest; name: string; warehouse?: string }) {
  const tx = useTx();
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
    <div className="card" style={{ padding: 14 }}>
      <strong>{name}</strong>
      <div className="muted" style={{ marginBottom: 10 }}>
        {kg(request.kg)} from {warehouse} · for {shortAddress(request.holder)} · asked {date(request.requestedAt)} · storage paid{" "}
        {usd(request.storageFee)} · {delivery ? `delivery, budget ${usd(request.deliveryBudget)}` : "pickup"}
      </div>
      <div className="row">
        {delivery && (
          <input className="input" style={{ maxWidth: 200 }} placeholder="Actual delivery fee (US$)" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        )}
        <button className="btn" disabled={tx.isBusy} onClick={() => void release()}>
          Goods have left: confirm
        </button>
        <input className="input" style={{ maxWidth: 240 }} placeholder="Reason (max 32 characters)" maxLength={32} value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn btn-danger" disabled={tx.isBusy} onClick={() => void reject()}>
          Reject and refund
        </button>
      </div>
      {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}
      <TxStatus tx={tx} success="Recorded." />
    </div>
  );
}
