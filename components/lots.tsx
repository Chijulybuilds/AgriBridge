import { useMemo } from "react";

import { referenceValuePerKg, useLotTimeline, type Commodity, type Loan, type Lot } from "../hooks/useProtocolData";
import { WAD } from "../lib/contracts/config";
import { date, nowSeconds, SECONDS_PER_DAY, usd } from "../lib/format";
import { Badge, CropSeal, StatusBadge, Timeline } from "./ui";

/** How safe an advance is, in words: healthy, worth watching, or at risk of being sold. */
export function loanHealth(loan: Loan): { label: string; tone: "green" | "gold" | "red" | "muted" } {
  if (loan.status !== "Active") return { label: loan.status, tone: "muted" };
  if (loan.liquidatable) return { label: "At risk", tone: "red" };
  if (Number(loan.maturity) * 1000 < Date.now()) return { label: "Overdue", tone: "red" };
  if (loan.healthFactor === undefined) return { label: "Price out of date", tone: "gold" };
  if (loan.healthFactor < (WAD * 13n) / 10n) return { label: "Watch", tone: "gold" };
  return { label: "Healthy", tone: "green" };
}

/** "Cocoa · lot 3" */
export function lotName(lot: Pick<Lot, "id" | "commodityId">, commodities: Map<bigint, Commodity>): string {
  return `${commodities.get(lot.commodityId)?.name ?? "Crop"} · lot ${lot.id}`;
}

/** A lot as lists show it: the crop's seal, its name, and a line underneath. */
export function LotLabel({
  lot,
  commodities,
  sub,
}: {
  lot: Pick<Lot, "id" | "commodityId">;
  commodities: Map<bigint, Commodity>;
  sub?: React.ReactNode;
}) {
  return (
    <span className="row" style={{ gap: 11, flexWrap: "nowrap" }}>
      <CropSeal name={commodities.get(lot.commodityId)?.name} size={32} />
      <span style={{ minWidth: 0 }}>
        <strong style={{ display: "block", whiteSpace: "nowrap" }}>{lotName(lot, commodities)}</strong>
        {sub && <span className="muted">{sub}</span>}
      </span>
    </span>
  );
}

export function GradeBadge({ grade }: { grade: string | undefined }) {
  if (!grade) return null;
  return <Badge tone={grade === "A" ? "green" : grade === "B" ? "gold" : "red"}>Grade {grade}</Badge>;
}

/** The one word that best describes a lot's state for its holder. */
export function LotState({ lot }: { lot: Lot }) {
  if (lot.frozen) return <StatusBadge status="Frozen" />;
  if (lot.expired) return <StatusBadge status="Expired" />;
  return <StatusBadge status={lot.status} />;
}

/**
 * What `kgHeld` of a lot is worth month by month until it expires, as the crop
 * ages. Uses the price as it is today: it shows the effect of ageing, not a forecast.
 */
export function ValueTimeline({ lot, commodity, kgHeld }: { lot: Lot; commodity: Commodity | undefined; kgHeld: bigint }) {
  const points = useMemo(() => {
    if (!lot.expiresAt) return [];
    const start = nowSeconds();
    const end = Number(lot.expiresAt);
    const steps = Math.min(12, Math.max(1, Math.ceil((end - start) / (30 * SECONDS_PER_DAY))));
    return Array.from({ length: steps + 1 }, (_, i) => Math.round(start + ((end - start - 60) * i) / steps));
  }, [lot.expiresAt]);
  const { data: factors } = useLotTimeline(lot.id, points);

  const perKgToday = referenceValuePerKg(lot, commodity);
  if (!factors || !commodity?.price || perKgToday === undefined) {
    return <p className="muted">The value timeline appears once the crop has a price.</p>;
  }

  const values = factors.map((factor, i) => ({
    label: date(points[i]),
    value: Number((commodity.price! * factor * kgHeld) / 10n ** 24n) / 1e6,
  }));
  return (
    <div>
      <Timeline points={values} format={(v) => usd(BigInt(Math.round(v * 1e6)))} />
      <p className="hint" style={{ marginTop: 8 }}>
        Worth {usd(BigInt(Math.round(values[0].value * 1e6)))} today and{" "}
        {usd(BigInt(Math.round(values[values.length - 1].value * 1e6)))} just before it expires on {date(lot.expiresAt)}, at
        today&apos;s price. Selling or borrowing early gets more for it.
      </p>
    </div>
  );
}
