import { useRouter } from "next/router";
import { useEffect, useState, type FormEvent } from "react";
import { useConnection } from "wagmi";
import { ClipboardDocumentListIcon, TruckIcon } from "@heroicons/react/24/outline";

import AppLayout from "../../components/layout/AppLayout";
import { lotName } from "../../components/lots";
import { TxStatus } from "../../components/TxStatus";
import { Card, EmptyState, KeyValue, Notice, PageHeader, Segmented, StatusBadge } from "../../components/ui";
import { useCommodities, useLots, useStorageFee, useUsdc, useWarehouses, useWithdrawalRequests } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { WarehouseDeskAbi } from "../../lib/contracts/abis";
import { contracts } from "../../lib/contracts/config";
import { date, kg, kgInput, parseKgUpTo, parseUsd, usd, usdPerKg } from "../../lib/format";
import { useRememberedRole } from "../../lib/session";

type Method = "pickup" | "delivery";

/**
 * Collect goods from the warehouse: pick them up, or have the warehouse deliver
 * them for a fee. Storage is paid by whoever collects. The verifier Safe confirms
 * the goods left the warehouse; until then the request can be cancelled for a full refund.
 */
export default function Collect() {
  const router = useRouter();
  const role = useRememberedRole("buyer");
  const { address } = useConnection();
  const { byId: commodities } = useCommodities();
  const { byId: warehouses } = useWarehouses();
  const { lots } = useLots(address);
  const { requests } = useWithdrawalRequests(address);
  const { balance } = useUsdc(address);
  const tx = useTx();

  const collectable = lots.filter((l) => l.balanceKg > 0n && l.status === "Verified" && !l.frozen);
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [method, setMethod] = useState<Method>("pickup");
  const [budget, setBudget] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const lot = collectable.find((l) => l.id.toString() === lotId);
  const commodity = lot ? commodities.get(lot.commodityId) : undefined;
  const kgAmount = lot ? parseKgUpTo(quantity, lot.balanceKg) : undefined;
  const { data: storageFee } = useStorageFee(lot?.id, kgAmount);
  const deliveryBudget = method === "delivery" ? (parseUsd(budget) ?? 0n) : 0n;

  useEffect(() => {
    if (lotId || collectable.length === 0) return;
    const wanted = typeof router.query.lot === "string" ? router.query.lot : undefined;
    const pick = collectable.find((l) => l.id.toString() === wanted) ?? (collectable.length === 1 ? collectable[0] : undefined);
    if (!pick) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- defaults depend on data that arrives after mount
    setLotId(pick.id.toString());
    setQuantity(kgInput(pick.balanceKg));
  }, [collectable, lotId, router.query.lot]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!lot) return setFormError("Choose what to collect.");
    if (!kgAmount || kgAmount > lot.balanceKg) return setFormError(`Enter up to ${kg(lot.balanceKg)}.`);
    if (method === "delivery" && deliveryBudget === 0n) return setFormError("Enter the most you'll pay for delivery.");

    try {
      // Storage accrues by the second until the request lands, so allow a little extra; the exact fee is what's charged.
      const fee = storageFee ?? 0n;
      await tx.ensureUsdc(contracts.desk!, fee + fee / 100n + 1_000_000n + deliveryBudget);
      await tx.ensureCropApproval(contracts.desk!);
      await tx.send(
        { address: contracts.desk!, abi: WarehouseDeskAbi, functionName: "requestWithdrawal", args: [lot.id, kgAmount, deliveryBudget] },
        "Ask to collect",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  async function cancel(requestId: bigint) {
    try {
      await tx.send({ address: contracts.desk!, abi: WarehouseDeskAbi, functionName: "cancelRequest", args: [requestId] }, "Cancel");
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <AppLayout role={role} title="Collect">
      <PageHeader
        eyebrow="Your stock"
        title="Collect from the warehouse"
        subtitle="Take your goods out of storage: pick them up yourself, or have the warehouse deliver them. Storage is paid when you collect."
      />

      {/* Outside the form, which empties once everything is on its way out. */}
      <TxStatus tx={tx} success="Request sent. The warehouse confirms when the goods leave; you can cancel until then." />

      <div className="grid-2">
        <Card title="Ask to collect">
          {collectable.length === 0 ? (
            <EmptyState icon={TruckIcon} title="Nothing to collect">
              Stock you hold in a warehouse can be picked up or delivered from here.
            </EmptyState>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="lot">Stock</label>
                <select id="lot" className="select" value={lotId} onChange={(e) => setLotId(e.target.value)}>
                  <option value="">Choose…</option>
                  {collectable.map((l) => (
                    <option key={l.id.toString()} value={l.id.toString()}>
                      {lotName(l, commodities)}, {kg(l.balanceKg)} at {warehouses.get(l.warehouseId)?.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="kg">Kilograms</label>
                <input id="kg" className="input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="field">
                <span className="field-label" id="method-label">
                  How
                </span>
                <Segmented
                  options={[
                    { id: "pickup", label: "I'll pick it up" },
                    { id: "delivery", label: "Deliver it to me" },
                  ]}
                  value={method}
                  onChange={setMethod}
                  testIdPrefix="method"
                  labelledBy="method-label"
                />
              </div>
              {method === "delivery" && (
                <div className="field">
                  <label htmlFor="budget">Most you&apos;ll pay for delivery (US$)</label>
                  <input id="budget" className="input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
                  <span className="hint">Held until delivery. You pay the actual cost and get the rest back.</span>
                </div>
              )}
              {lot && (
                <div style={{ margin: "6px 0 14px" }}>
                  <KeyValue label="Warehouse" value={`${warehouses.get(lot.warehouseId)?.name}, ${warehouses.get(lot.warehouseId)?.region}`} />
                  <KeyValue
                    label="Storage owed"
                    value={storageFee !== undefined ? usd(storageFee) : "—"}
                    testId="storage-fee"
                  />
                  {commodity && <KeyValue label="Storage rate" value={`${usdPerKg(commodity.storageFeePerTonMonth / 1000n)} a month`} />}
                  {method === "delivery" && <KeyValue label="Delivery budget" value={usd(deliveryBudget)} />}
                  <KeyValue label="You have" value={usd(balance)} />
                </div>
              )}
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button className="btn btn-block" type="submit" disabled={tx.isBusy} data-testid="submit-collect">
                {tx.isBusy ? "Working…" : "Ask to collect"}
              </button>
            </form>
          )}
        </Card>

        <Card title="My requests">
          {requests.length === 0 ? (
            <EmptyState icon={ClipboardDocumentListIcon}>No requests yet.</EmptyState>
          ) : (
            <table className="table">
              <tbody>
                {requests.map((r) => {
                  const requestLot = lots.find((l) => l.id === r.lotId);
                  return (
                    <tr key={r.id.toString()}>
                      <td>
                        <strong>{requestLot ? lotName(requestLot, commodities) : `Lot ${r.lotId}`}</strong>
                        <div className="muted">
                          {kg(r.kg)} · {r.deliveryBudget > 0n ? "delivery" : "pickup"} · {date(r.requestedAt)}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={r.status === "Pending" ? "Awaiting warehouse" : r.status} />
                      </td>
                      <td>
                        {r.status === "Pending" && (
                          <button className="btn btn-secondary btn-small" disabled={tx.isBusy} onClick={() => void cancel(r.id)}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <Notice>Pending requests are confirmed by the warehouse team when the goods leave. Cancelling refunds everything.</Notice>
        </Card>
      </div>
    </AppLayout>
  );
}
