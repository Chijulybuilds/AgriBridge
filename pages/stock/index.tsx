import Link from "next/link";
import { useState } from "react";
import { useConnection } from "wagmi";
import { ArchiveBoxIcon, BanknotesIcon, ClockIcon, ScaleIcon } from "@heroicons/react/24/outline";

import AppLayout from "../../components/layout/AppLayout";
import { GradeBadge, LotState, lotName, ValueTimeline } from "../../components/lots";
import { Card, CropSeal, EmptyState, Notice, PageHeader, Skeleton, Stat } from "../../components/ui";
import { lotValue, useCommodities, useLoans, useLots, useWarehouses, type Lot } from "../../hooks/useProtocolData";
import { date, kg, relativeDays, SECONDS_PER_DAY, usd, useNow } from "../../lib/format";
import { useRememberedRole } from "../../lib/session";

/**
 * Everything the person holds in the warehouses, whether they delivered it or
 * bought it: what it is worth today, how it will age, and what they can do with it.
 */
export default function MyStock() {
  const role = useRememberedRole("farmer");
  const { address } = useConnection();
  const { byId: commodities } = useCommodities();
  const { byId: warehouses } = useWarehouses();
  const { lots, isLoading } = useLots(address);
  const { loans } = useLoans(address);
  const [openLot, setOpenLot] = useState<bigint>();
  const now = useNow();

  const held = lots.filter((l) => l.balanceKg > 0n);
  const pledged = new Map<bigint, bigint>();
  for (const loan of loans.filter((l) => l.status === "Active")) {
    pledged.set(loan.lotId, (pledged.get(loan.lotId) ?? 0n) + loan.collateralKg);
  }
  const total = held.reduce((sum, l) => sum + (lotValue(l, commodities.get(l.commodityId), l.balanceKg) ?? 0n), 0n);
  const totalKg = held.reduce((sum, l) => sum + l.balanceKg, 0n);
  const expiring = held.filter((l) => l.expiresAt && !l.expired && Number(l.expiresAt) - now < 30 * SECONDS_PER_DAY);

  return (
    <AppLayout role={role} title="My stock">
      <PageHeader
        eyebrow="Your stock"
        title="My stock"
        subtitle="Crop you own in the warehouses, delivered or bought. One unit is one kilogram, and its value falls slowly as it ages."
      />

      <div className="grid-4">
        <Stat icon={BanknotesIcon} label="Worth today" value={usd(total)} testId="stock-value" />
        <Stat icon={ScaleIcon} tone="blue" label="Kilograms held" value={kg(totalKg)} sub={`${held.length} lot${held.length === 1 ? "" : "s"}`} />
        <Stat icon={ClockIcon} tone="gold" label="Expiring within 30 days" value={String(expiring.length)} sub="Sell or collect these first" />
      </div>

      {expiring.length > 0 && (
        <Notice tone="warn">
          Some of your stock expires soon. After that it can only be sold to AgriBridge at a discount, for animal feed.
        </Notice>
      )}

      <Card title="Lots" testId="stock">
        {isLoading ? (
          <Skeleton rows={4} />
        ) : held.length === 0 ? (
          <EmptyState
            icon={ArchiveBoxIcon}
            title="Nothing in storage yet"
            action={
              <div className="row" style={{ justifyContent: "center" }}>
                <Link className="btn btn-small" href="/farmer/deliver">
                  Deliver a crop
                </Link>
                <Link className="btn btn-secondary btn-small" href="/market">
                  Buy on the market
                </Link>
              </div>
            }
          >
            Crop you deliver or buy shows up here, ready to borrow against, sell or collect.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Crop</th>
                  <th>Grade now</th>
                  <th>Warehouse</th>
                  <th>You hold</th>
                  <th>Worth today</th>
                  <th>Expires</th>
                  <th>Do</th>
                </tr>
              </thead>
              <tbody>
                {held.map((lot) => (
                  <StockRow
                    key={lot.id.toString()}
                    lot={lot}
                    name={lotName(lot, commodities)}
                    crop={commodities.get(lot.commodityId)?.name}
                    warehouse={warehouses.get(lot.warehouseId)?.name}
                    value={lotValue(lot, commodities.get(lot.commodityId), lot.balanceKg)}
                    pledged={pledged.get(lot.id)}
                    open={openLot === lot.id}
                    onToggle={() => setOpenLot(openLot === lot.id ? undefined : lot.id)}
                    timeline={<ValueTimeline lot={lot} commodity={commodities.get(lot.commodityId)} kgHeld={lot.balanceKg} />}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}

function StockRow({
  lot,
  name,
  crop,
  warehouse,
  value,
  pledged,
  open,
  onToggle,
  timeline,
}: {
  lot: Lot;
  name: string;
  crop?: string;
  warehouse?: string;
  value?: bigint;
  pledged?: bigint;
  open: boolean;
  onToggle: () => void;
  timeline: React.ReactNode;
}) {
  return (
    <>
      <tr>
        <td>
          <span className="row" style={{ gap: 11, flexWrap: "nowrap" }}>
            <CropSeal name={crop} size={32} />
            <span>
              <strong style={{ whiteSpace: "nowrap" }}>{name}</strong>
              <span className="row" style={{ gap: 6, marginTop: 3 }}>
                <LotState lot={lot} />
              </span>
            </span>
          </span>
        </td>
        <td>
          <GradeBadge grade={lot.currentGrade} />
          {lot.currentGrade !== lot.intakeGrade && <div className="muted">was {lot.intakeGrade} at intake</div>}
        </td>
        <td>{warehouse}</td>
        <td>
          {kg(lot.balanceKg)}
          {pledged ? <div className="muted">+ {kg(pledged)} as security</div> : null}
        </td>
        <td>{usd(value)}</td>
        <td>
          {date(lot.expiresAt)}
          <div className="muted">{relativeDays(lot.expiresAt)}</div>
        </td>
        <td>
          <div className="row" style={{ gap: 6 }}>
            {lot.usable && (
              <>
                <Link className="btn btn-small" href={`/farmer/advance?lot=${lot.id}`}>
                  Borrow
                </Link>
                <Link className="btn btn-secondary btn-small" href={`/market/sell?lot=${lot.id}`}>
                  Sell
                </Link>
              </>
            )}
            {lot.expired && !lot.frozen && (
              <Link className="btn btn-gold btn-small" href={`/market/clearance?lot=${lot.id}`}>
                Sell expired stock
              </Link>
            )}
            {!lot.frozen && (
              <Link className="btn btn-secondary btn-small" href={`/stock/collect?lot=${lot.id}`}>
                Collect
              </Link>
            )}
            <button className="link" onClick={onToggle} style={{ fontSize: 12 }}>
              {open ? "Hide value" : "Value over time"}
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7}>{timeline}</td>
        </tr>
      )}
    </>
  );
}
