import type { CSSProperties } from "react";
import { m } from "motion/react";

import { CountUp } from "./CountUp";
import { cropColour, CropSeal } from "./ui";
import type { Commodity, Warehouse } from "../hooks/useProtocolData";
import { kg, percentFromBps, pricePerKg } from "../lib/format";
import { BPS } from "../lib/contracts/config";

/**
 * The market at a glance, read like an infographic: the one figure that matters (what the crop for
 * sale is worth), then how much of each crop is in the warehouses and how much of it is listed,
 * then how full each warehouse is. Each crop's bar is also a filter for the listings below.
 */

export type CropStock = { commodity: Commodity; storedKg: bigint; forSaleKg: bigint };

export function MarketOverview({
  valueForSale,
  kgForSale,
  listingCount,
  crops,
  warehouses,
  selectedCrop,
  onSelectCrop,
  selectedWarehouse,
  onSelectWarehouse,
}: {
  valueForSale: number | undefined;
  kgForSale: bigint;
  listingCount: number;
  crops: CropStock[];
  warehouses: Warehouse[];
  selectedCrop: string;
  onSelectCrop: (id: string) => void;
  selectedWarehouse: string;
  onSelectWarehouse: (id: string) => void;
}) {
  const storedKg = crops.reduce((sum, c) => sum + c.storedKg, 0n);
  const tallest = crops.reduce((max, c) => (c.storedKg > max ? c.storedKg : max), 0n);

  return (
    <div className="market-overview">
      <section className="card market-hero" aria-labelledby="for-sale-title" data-testid="market-overview">
        <h2 id="for-sale-title" className="market-hero-label">
          Crop for sale now
        </h2>
        <p className="market-hero-figure" data-testid="market-value">
          <CountUp value={valueForSale} format={dollars} />
        </p>
        <p className="market-hero-sub">
          {kg(kgForSale)} in {listingCount} listing{listingCount === 1 ? "" : "s"}, out of {kg(storedKg)} in the warehouses
        </p>

        <div className="crop-chart-head">
          <h3 id="by-crop-title">By crop</h3>
          <span className="crop-legend" aria-hidden="true">
            <span className="crop-legend-key crop-legend-sale" /> For sale
            <span className="crop-legend-key crop-legend-stored" /> Stored
          </span>
        </div>
        {tallest === 0n ? (
          <p className="muted">No verified crop in the warehouses yet.</p>
        ) : (
          <div className="crop-chart" role="group" aria-labelledby="by-crop-title">
            {crops.map(({ commodity, storedKg: stored, forSaleKg }, i) => {
              const id = commodity.id.toString();
              const share = stored > 0n ? Number((forSaleKg * BPS) / stored) : 0;
              const selected = selectedCrop === id;
              return (
                <button
                  key={id}
                  type="button"
                  className="crop-bar"
                  aria-pressed={selected}
                  data-dimmed={selectedCrop !== "" && !selected}
                  onClick={() => onSelectCrop(selected ? "" : id)}
                  aria-label={`${commodity.name}: ${kg(stored)} stored, ${kg(forSaleKg)} for sale. ${selected ? "Show all crops" : `Show only ${commodity.name}`}`}
                  style={{ "--crop": cropColour(commodity.name), "--i": i } as CSSProperties}
                >
                  <span className="crop-bar-share" aria-hidden="true">
                    {stored > 0n ? percentFromBps(share) : "–"}
                  </span>
                  <span className="crop-bar-column" aria-hidden="true">
                    <span className="crop-bar-stored" style={{ height: `${barHeight(stored, tallest)}%` }}>
                      <span className="crop-bar-sale" style={{ height: `${share / 100}%` }} />
                    </span>
                  </span>
                  <span className="crop-bar-name" aria-hidden="true">
                    {commodity.name}
                  </span>
                  <span className="crop-bar-tip" aria-hidden="true">
                    {kg(forSaleKg)} for sale of {kg(stored)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="warehouses-title">
        <h2 id="warehouses-title" style={{ marginBottom: 20 }}>
          Warehouses
        </h2>
        {warehouses.length === 0 ? (
          <p className="muted">No warehouses yet.</p>
        ) : (
          <ul className="fill-list">
            {warehouses.map((w, i) => {
              const id = w.id.toString();
              const full = w.capacityKg > 0n ? Number((w.storedKg * BPS) / w.capacityKg) : 0;
              const selected = selectedWarehouse === id;
              return (
                <li key={id} style={{ "--i": i } as CSSProperties}>
                  <button
                    type="button"
                    className="fill-row"
                    aria-pressed={selected}
                    data-dimmed={selectedWarehouse !== "" && !selected}
                    onClick={() => onSelectWarehouse(selected ? "" : id)}
                  >
                    <span className="spread" style={{ gap: 12 }}>
                      <span>
                        <strong>{w.name}</strong> <span className="text-secondary">{w.region}</span>
                      </span>
                      <span className="num">{full < 50 && w.storedKg > 0n ? "<1%" : percentFromBps(full)}</span>
                    </span>
                    <span className="fill-track" aria-hidden="true">
                      <span className="fill-bar" data-high={full >= 9_000} style={{ width: `${Math.min(full, 10_000) / 100}%` }} />
                    </span>
                    <span className="muted">
                      {kg(w.storedKg)} of {kg(w.capacityKg)}
                      {w.frozen ? " · frozen" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Bars keep a sliver of height, so a crop with a little stock still shows. */
function barHeight(value: bigint, max: bigint): number {
  if (max === 0n || value === 0n) return 0;
  return Math.max(4, Number((value * 10_000n) / max) / 100);
}

function dollars(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Each crop's price today and how a kilogram of it loses value as it ages: full value at grade A,
 * down to the grade B level, then to the grade C level, where it holds until it expires. This is
 * the same schedule the contracts use, so buyers can see what an older lot is worth.
 */
export function PriceAgeing({ commodities }: { commodities: Commodity[] }) {
  const priced = commodities.filter((c) => c.active && c.price);
  if (priced.length === 0) return <p className="muted">Prices appear once they are set.</p>;
  return (
    <ul className="price-grid">
      {priced.map((c, i) => (
        <li key={c.id.toString()} className="price-card" style={{ "--crop": cropColour(c.name) } as CSSProperties}>
          <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
            <CropSeal name={c.name} size={26} />
            <h3 style={{ fontSize: 15 }}>{c.name}</h3>
          </div>
          <p className="price-card-figure">{pricePerKg(c.price)}</p>
          <p className="muted" style={{ marginBottom: 14 }}>
            Grade A today
          </p>
          <AgeingCurve commodity={c} column={i % 3} />
          <p className="hint" style={{ marginTop: 10 }}>
            Worth {percentFromBps(c.gradeBFactorBps)} at grade B (day {c.daysToGradeB}), {percentFromBps(c.gradeCFactorBps)} at grade C
            (day {c.daysToGradeC}). Expires on day {c.daysToExpiry}.
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The decay schedule as a line: it draws itself once, when the card scrolls into view. Cards in a
 * row draw left to right, 60ms apart (--stagger), so a row never moves all at once.
 */
function AgeingCurve({ commodity: c, column }: { commodity: Commodity; column: number }) {
  const W = 240;
  const H = 64;
  const end = Math.max(c.daysToExpiry, c.daysToGradeC, 1);
  const x = (day: number) => (Math.min(day, end) / end) * W;
  // Honest scale: the top is full value, the bottom is zero.
  const y = (bps: number) => 4 + (1 - bps / 10_000) * (H - 8);
  const points: Array<[number, number]> = [
    [x(0), y(10_000)],
    [x(c.daysToGradeB), y(c.gradeBFactorBps)],
    [x(c.daysToGradeC), y(c.gradeCFactorBps)],
    [x(end), y(c.gradeCFactorBps)],
  ];
  const line = points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <svg className="ageing-curve" viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={`${c.name} value as it ages`}>
      <path d={area} className="ageing-area" />
      <m.path
        d={line}
        className="ageing-line"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.72, ease: [0.2, 0, 0, 1], delay: column * 0.06 }}
      />
      {(
        [
          ["A", 0],
          ["B", c.daysToGradeB],
          ["C", c.daysToGradeC],
        ] as const
      ).map(([grade, day]) => (
        <text key={grade} x={Math.min(Math.max(x(day), 6), W - 6)} y={H + 13} className="ageing-tick" textAnchor="middle">
          {grade}
        </text>
      ))}
    </svg>
  );
}
