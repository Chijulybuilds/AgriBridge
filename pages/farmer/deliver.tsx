import { useState, type FormEvent } from "react";
import { useConnection } from "wagmi";

import { TruckIcon } from "@heroicons/react/24/outline";

import AppLayout from "../../components/layout/AppLayout";
import { GradeBadge, LotLabel } from "../../components/lots";
import { TxStatus } from "../../components/TxStatus";
import { Card, CropSeal, EmptyState, PageHeader, Segmented, StatusBadge } from "../../components/ui";
import { useCommodities, useLots, useWarehouses } from "../../hooks/useProtocolData";
import { findQueued, useSafeQueue } from "../../hooks/useSafeQueue";
import { useTx } from "../../hooks/useTx";
import { CommodityRegistryAbi } from "../../lib/contracts/abis";
import { contracts, VERIFIER_SAFE } from "../../lib/contracts/config";
import { lotAction } from "../../lib/safeQueue";
import { bytes32ToText, date, harvestTimestamp, isoDay, kg, nowSeconds, parseKg } from "../../lib/format";
import { InfoTip } from "../../components/help/InfoTip";

/** A bag, the way farmers count a harvest. The warehouse still weighs it; the measured kilograms are what count. */
const BAG_KG = 50;
const BAG_CHOICES = [10, 20, 50, 100];
const KG_CHOICES = [500, 1000, 2000, 5000];

type Unit = "bags" | "kg";
type HarvestWhen = "today" | "week" | "month" | "other";

const LAST_CROP_KEY = "agribridge.deliver.crop";
const LAST_WAREHOUSE_KEY = "agribridge.deliver.warehouse";

function remembered(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse; the form still works, it just won't remember.
  }
}

/**
 * Book a delivery: the farmer says what they are bringing and where. The
 * warehouse team (the verifier Safe) then weighs and grades it, and the crop
 * becomes stock the farmer can borrow against or sell.
 *
 * Every choice starts from a sensible default, so a typical delivery is three taps: the crop (or the
 * one used last time), a number of bags, and Book. The first warehouse with room (or the last one
 * used) is already chosen, and the harvest date starts at today.
 */
export default function Deliver() {
  const { address } = useConnection();
  const { commodities, byId: commodityById } = useCommodities();
  const { warehouses, byId: warehouseById } = useWarehouses();
  const { lots } = useLots(address);
  const tx = useTx();

  // The app renders only in the browser (components/providers.tsx), so the last choices can be read straight away.
  const [pickedCrop, setCommodityId] = useState(() => remembered(LAST_CROP_KEY));
  const [pickedWarehouse, setWarehouseId] = useState(() => remembered(LAST_WAREHOUSE_KEY));
  const [changingWarehouse, setChangingWarehouse] = useState(false);
  const [unit, setUnit] = useState<Unit>("bags");
  const [quantity, setQuantity] = useState("");
  const [when, setWhen] = useState<HarvestWhen>("today");
  const [otherDay, setOtherDay] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const openCommodities = commodities.filter((c) => c.active);
  const openWarehouses = warehouses.filter((w) => w.active && !w.frozen);
  const mine = lots.filter((l) => address && l.farmer.toLowerCase() === address.toLowerCase()).reverse();
  // The warehouse's decisions waiting in its Safe; read only while a delivery of theirs is still waiting.
  const safeQueue = useSafeQueue(mine.some((l) => l.status === "Pending") ? VERIFIER_SAFE : undefined, { check: false });
  const now = nowSeconds();
  const today = isoDay(now);
  const harvestDay =
    when === "today" ? today : when === "week" ? isoDay(now - 7 * 86_400) : when === "month" ? isoDay(now - 30 * 86_400) : otherDay;

  // Start from the crop and warehouse used last time, while they are still open; otherwise no crop, and the
  // first warehouse that still has room.
  const firstWithRoom = openWarehouses.find((w) => w.capacityKg > w.storedKg);
  const commodityId = openCommodities.some((c) => c.id.toString() === pickedCrop) ? pickedCrop : "";
  const warehouseId = openWarehouses.some((w) => w.id.toString() === pickedWarehouse) ? pickedWarehouse : (firstWithRoom?.id.toString() ?? "");

  const crop = commodityId ? commodityById.get(BigInt(commodityId)) : undefined;
  const chosenWarehouse = warehouseId ? warehouseById.get(BigInt(warehouseId)) : undefined;
  const typed = parseKg(quantity);
  const kgAmount = typed === undefined ? undefined : unit === "bags" ? typed * BigInt(BAG_KG) : typed;
  const bags = kgAmount === undefined ? undefined : Number(kgAmount / 10n ** 18n) / BAG_KG;
  const whenWords =
    when === "today"
      ? "harvested today"
      : when === "week"
        ? "harvested about a week ago"
        : when === "month"
          ? "harvested about a month ago"
          : otherDay
            ? `harvested on ${date(harvestTimestamp(otherDay) ?? 0)}`
            : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const harvest = harvestTimestamp(harvestDay);
    if (!commodityId) return setFormError("Choose the crop you're delivering.");
    if (!warehouseId) return setFormError("Choose a warehouse.");
    if (!kgAmount || kgAmount < 10n ** 18n) {
      return setFormError(unit === "bags" ? "Enter how many bags you're bringing." : "Enter the quantity in kilograms (at least 1 kg).");
    }
    if (!harvest) return setFormError("Choose the harvest date.");
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
      remember(LAST_CROP_KEY, commodityId);
      remember(LAST_WAREHOUSE_KEY, warehouseId);
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
      <PageHeader section="deliver"
        eyebrow="Farmer"
        title="Deliver a crop"
        subtitle="Tell us what you're bringing. At the warehouse it's weighed and graded, and then it appears in My stock, ready to borrow against or sell."
      />

      <div className="grid-2">
        <Card title="Book a delivery" tour="deliver-form" help="deliver">
          <form onSubmit={submit} noValidate>
            <fieldset className="field">
              <legend className="field-label">What are you bringing?</legend>
              <div className="crop-choices" data-testid="commodity">
                {openCommodities.map((c) => (
                  <label key={c.id.toString()} className="crop-choice" data-testid={`crop-${c.name.toLowerCase()}`}>
                    <input
                      type="radio"
                      name="crop"
                      value={c.id.toString()}
                      checked={commodityId === c.id.toString()}
                      onChange={() => setCommodityId(c.id.toString())}
                    />
                    <CropSeal name={c.name} size={30} />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <span className="field-label" id="quantity-label">
                How much?
              </span>
              <Segmented
                options={[
                  { id: "bags", label: `Bags of ${BAG_KG} kg` },
                  { id: "kg", label: "Kilograms" },
                ]}
                value={unit}
                onChange={(next) => {
                  setUnit(next);
                  setQuantity("");
                }}
                testIdPrefix="unit"
                labelledBy="quantity-label"
              />
              <div className="row quick-amounts">
                {(unit === "bags" ? BAG_CHOICES : KG_CHOICES).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="btn btn-secondary btn-small"
                    aria-pressed={quantity === String(n)}
                    data-testid={`amount-${n}`}
                    onClick={() => setQuantity(String(n))}
                  >
                    {unit === "bags" ? `${n} bags` : kg(BigInt(n) * 10n ** 18n)}
                  </button>
                ))}
              </div>
              <input
                id="quantity"
                className="input"
                data-testid="quantity"
                inputMode="decimal"
                aria-labelledby="quantity-label"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={unit === "bags" ? "Or type the number of bags" : "Or type the kilograms"}
              />
              <span className="hint" data-testid="quantity-hint">
                {kgAmount && bags !== undefined
                  ? unit === "bags"
                    ? `About ${kg(kgAmount)}. The warehouse weighs it; the measured weight is what counts.`
                    : `About ${bags.toLocaleString("en-US", { maximumFractionDigits: 1 })} bags of ${BAG_KG} kg. The warehouse weighs it; the measured weight is what counts.`
                  : "A rough figure is fine: the warehouse weighs it, and the measured weight is what counts."}
              </span>
            </div>

            <div className="field">
              <span className="field-label" id="harvest-label">
                When did you harvest it?
              </span>
              <Segmented
                options={[
                  { id: "today", label: "Today" },
                  { id: "week", label: "Last week" },
                  { id: "month", label: "Last month" },
                  { id: "other", label: "Another day" },
                ]}
                value={when}
                onChange={setWhen}
                testIdPrefix="harvest"
                labelledBy="harvest-label"
              />
              {when === "other" && (
                <input
                  id="harvest"
                  className="input"
                  type="date"
                  max={today}
                  aria-labelledby="harvest-label"
                  data-testid="harvest-date"
                  value={otherDay}
                  onChange={(e) => setOtherDay(e.target.value)}
                />
              )}
            </div>

            <div className="field">
              <span className="field-label">
                Warehouse <InfoTip id="warehouse" />
              </span>
              {changingWarehouse || !chosenWarehouse ? (
                <select
                  id="warehouse"
                  className="select"
                  aria-label="Warehouse"
                  data-testid="warehouse"
                  value={warehouseId}
                  onChange={(e) => {
                    setWarehouseId(e.target.value);
                    setChangingWarehouse(false);
                  }}
                >
                  <option value="">Choose…</option>
                  {openWarehouses.map((w) => (
                    <option key={w.id.toString()} value={w.id.toString()}>
                      {w.name}, {w.region} ({kg(w.capacityKg - w.storedKg)} free)
                    </option>
                  ))}
                </select>
              ) : (
                <div className="warehouse-chosen" data-testid="warehouse-chosen">
                  <span>
                    <strong>{chosenWarehouse.name}</strong>
                    <span className="muted">
                      {" "}
                      · {chosenWarehouse.region} · {kg(chosenWarehouse.capacityKg - chosenWarehouse.storedKg)} free
                    </span>
                  </span>
                  {openWarehouses.length > 1 && (
                    <button type="button" className="link" data-testid="warehouse-change" onClick={() => setChangingWarehouse(true)}>
                      Change
                    </button>
                  )}
                </div>
              )}
            </div>

            {crop && kgAmount && chosenWarehouse && harvestDay && (
              <p className="delivery-summary" data-testid="delivery-summary">
                You&apos;re bringing{" "}
                <strong>
                  {unit === "bags" ? `${quantity} bags (about ${kg(kgAmount)})` : kg(kgAmount)} of {crop.name.toLowerCase()}
                </strong>{" "}
                to <strong>{chosenWarehouse.name}</strong>, {whenWords}.
              </p>
            )}
            {formError && (
              <p className="form-error" role="alert" data-testid="form-error">
                {formError}
              </p>
            )}
            <button className="btn btn-block" type="submit" disabled={tx.isBusy} data-testid="submit-delivery" data-tour="deliver-submit">
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

      <Card title="My deliveries" testId="deliveries" tour="deliveries-list" help="pending">
        {mine.length === 0 ? (
          <EmptyState art="deliver" icon={TruckIcon} title="No deliveries yet">
            Your bookings appear here, with the weight and grade once the warehouse has checked them.
          </EmptyState>
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
                      <LotLabel lot={lot} commodities={commodityById} />
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
                      {lot.status === "Pending" &&
                        (findQueued(safeQueue.data?.queued, lotAction(lot.id)) ? (
                          <span className="muted" data-testid="being-checked">
                            Being signed off
                          </span>
                        ) : (
                          <button className="btn btn-secondary btn-small" disabled={tx.isBusy} onClick={() => void cancel(lot.id)}>
                            Cancel
                          </button>
                        ))}
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
