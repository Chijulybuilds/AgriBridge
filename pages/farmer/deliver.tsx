import { useState, type FormEvent } from "react";
import { useConnection } from "wagmi";

import AppLayout from "../../components/layout/AppLayout";
import { GradeBadge, lotName } from "../../components/lots";
import { TxStatus } from "../../components/TxStatus";
import { Card, EmptyState, PageHeader, StatusBadge } from "../../components/ui";
import { useCommodities, useLots, useWarehouses } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { CommodityRegistryAbi } from "../../lib/contracts/abis";
import { contracts } from "../../lib/contracts/config";
import { bytes32ToText, date, harvestTimestamp, isoDay, kg, nowSeconds, parseKg } from "../../lib/format";

/**
 * Book a delivery: the farmer says what they are bringing and where. The
 * warehouse team (the verifier Safe) then weighs and grades it, and the crop
 * becomes stock the farmer can borrow against or sell.
 */
export default function Deliver() {
  const { address } = useConnection();
  const { commodities, byId: commodityById } = useCommodities();
  const { warehouses, byId: warehouseById } = useWarehouses();
  const { lots } = useLots(address);
  const tx = useTx();

  const [commodityId, setCommodityId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [harvestDay, setHarvestDay] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const openCommodities = commodities.filter((c) => c.active);
  const openWarehouses = warehouses.filter((w) => w.active && !w.frozen);
  const mine = lots.filter((l) => address && l.farmer.toLowerCase() === address.toLowerCase()).reverse();
  const today = isoDay(nowSeconds());

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const kgAmount = parseKg(quantity);
    const harvest = harvestTimestamp(harvestDay);
    if (!commodityId) return setFormError("Choose the crop you're delivering.");
    if (!warehouseId) return setFormError("Choose a warehouse.");
    if (!kgAmount || kgAmount < 10n ** 18n) return setFormError("Enter the quantity in kilograms (at least 1 kg).");
    if (!harvest) return setFormError("Enter the harvest date.");
    if (harvestDay > today) return setFormError("The harvest date can't be in the future.");

    const warehouse = warehouseById.get(BigInt(warehouseId));
    if (warehouse && warehouse.storedKg + kgAmount > warehouse.capacityKg) {
      return setFormError(`${warehouse.name} only has room for ${kg(warehouse.capacityKg - warehouse.storedKg)} more.`);
    }

    try {
      await tx.send(
        {
          address: contracts.registry!,
          abi: CommodityRegistryAbi,
          functionName: "requestIntake",
          args: [BigInt(commodityId), kgAmount, BigInt(warehouseId), BigInt(harvest)],
        },
        "Book the delivery",
      );
      setQuantity("");
    } catch {
      // Shown by TxStatus.
    }
  }

  async function cancel(lotId: bigint) {
    try {
      await tx.send({ address: contracts.registry!, abi: CommodityRegistryAbi, functionName: "cancelIntake", args: [lotId] }, "Cancel the delivery");
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <AppLayout role="farmer" title="Deliver a crop">
      <PageHeader
        title="Deliver a crop"
        subtitle="Tell us what you're bringing. At the warehouse it's weighed and graded, and then it appears in My stock, ready to borrow against or sell."
      />

      <div className="grid-2">
        <Card title="Book a delivery">
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="commodity">Crop</label>
              <select id="commodity" className="select" data-testid="commodity" value={commodityId} onChange={(e) => setCommodityId(e.target.value)}>
                <option value="">Choose…</option>
                {openCommodities.map((c) => (
                  <option key={c.id.toString()} value={c.id.toString()}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="warehouse">Warehouse</label>
              <select id="warehouse" className="select" data-testid="warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">Choose…</option>
                {openWarehouses.map((w) => (
                  <option key={w.id.toString()} value={w.id.toString()}>
                    {w.name}, {w.region} ({kg(w.capacityKg - w.storedKg)} free)
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quantity">About how many kilograms?</label>
              <input id="quantity" className="input" data-testid="quantity" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1000" />
              <span className="hint">The warehouse weighs it; the measured weight is what counts.</span>
            </div>
            <div className="field">
              <label htmlFor="harvest">Harvest date</label>
              <input id="harvest" className="input" type="date" max={today} data-testid="harvest-date" value={harvestDay} onChange={(e) => setHarvestDay(e.target.value)} />
            </div>
            {formError && (
              <p className="form-error" data-testid="form-error">
                {formError}
              </p>
            )}
            <button className="btn btn-block" type="submit" disabled={tx.isBusy} data-testid="submit-delivery">
              {tx.isBusy ? "Booking…" : "Book delivery"}
            </button>
            <TxStatus tx={tx} success="Delivery booked. Bring the crop to the warehouse for weighing and grading." />
          </form>
        </Card>

        <Card title="What happens next">
          <ol style={{ paddingLeft: 18, lineHeight: 1.8, fontSize: 13 }} className="text-secondary">
            <li>Bring the crop to the warehouse you chose.</li>
            <li>The warehouse team weighs it, checks its quality and gives it a grade (A, B or C).</li>
            <li>It appears in <strong>My stock</strong>: one unit per kilogram, in your name.</li>
            <li>Borrow against it, sell it, or collect it later. Its value falls slowly as it ages.</li>
          </ol>
        </Card>
      </div>

      <Card title="My deliveries" testId="deliveries">
        {mine.length === 0 ? (
          <EmptyState>No deliveries yet.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Crop</th>
                  <th>Warehouse</th>
                  <th>Weight</th>
                  <th>Status</th>
                  <th>Booked</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mine.map((lot) => (
                  <tr key={lot.id.toString()}>
                    <td>
                      <strong>{lotName(lot, commodityById)}</strong>
                    </td>
                    <td>{warehouseById.get(lot.warehouseId)?.name}</td>
                    <td>
                      {lot.status === "Verified" ? (
                        <>
                          {kg(lot.measuredKg)} <span className="muted">measured</span>
                        </>
                      ) : (
                        <>
                          {kg(lot.estimatedKg)} <span className="muted">estimated</span>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <StatusBadge status={lot.status} />
                        {lot.status === "Verified" && <GradeBadge grade={lot.intakeGrade} />}
                      </div>
                      {lot.status === "Rejected" && bytes32ToText(lot.rejectionReason) && (
                        <div className="muted">Reason: {bytes32ToText(lot.rejectionReason)}</div>
                      )}
                    </td>
                    <td className="muted">{date(lot.requestedAt)}</td>
                    <td>
                      {lot.status === "Pending" && (
                        <button className="btn btn-secondary btn-small" disabled={tx.isBusy} onClick={() => void cancel(lot.id)}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
