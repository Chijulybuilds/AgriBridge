import { DocumentTextIcon, ExclamationTriangleIcon, ScaleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

import AppLayout from "../../components/layout/AppLayout";
import { loanHealth, LotLabel } from "../../components/lots";
import { Badge, Card, CropSeal, EmptyState, PageHeader, Stat } from "../../components/ui";
import { lotValue, useCommodities, useLoans, useLots, usePoolStats } from "../../hooks/useProtocolData";
import { BPS } from "../../lib/contracts/config";
import { date, kg, percentFromBps, percentFromWad, pricePerKg, relativeDays, usd } from "../../lib/format";

/**
 * The pool's risk, in the open: every active advance with its health, the
 * prices it depends on, and the cushion that absorbs losses first.
 */
export default function Risk() {
  const { stats } = usePoolStats();
  const { loans } = useLoans("all-active");
  const { lots } = useLots();
  const { commodities, byId } = useCommodities();
  const lotById = new Map(lots.map((l) => [l.id, l]));

  const atRisk = loans.filter((l) => {
    const health = loanHealth(l).label;
    return health === "At risk" || health === "Overdue";
  });
  const totalDebt = loans.reduce((sum, l) => sum + l.debt, 0n);
  const totalValue = loans.reduce((sum, l) => {
    const lot = lotById.get(l.lotId);
    return sum + (lot ? (lotValue(lot, byId.get(lot.commodityId), l.collateralKg) ?? 0n) : 0n);
  }, 0n);
  const averageLtv = totalValue > 0n ? (totalDebt * BPS) / totalValue : undefined;

  return (
    <AppLayout role="investor" title="Risk">
      <PageHeader
        eyebrow="Investor"
        title="Risk"
        subtitle="Every advance the pool has made, how safe each one is, and the prices behind them."
      />

      <div className="grid-4">
        <Stat icon={DocumentTextIcon} tone="blue" label="Active advances" value={String(loans.length)} sub={`${usd(totalDebt)} owed`} />
        <Stat icon={ScaleIcon} tone="gold" label="Average loan-to-value" value={averageLtv !== undefined ? percentFromBps(averageLtv, 1) : "—"} sub="Settled at 80%" />
        <Stat icon={ExclamationTriangleIcon} tone="red" label="At risk or overdue" value={String(atRisk.length)} />
        <Stat icon={ShieldCheckIcon} label="Loss cushion" value={usd(stats?.reserves)} sub={stats ? `${percentFromWad(stats.utilization, 0)} of the pool lent out` : undefined} />
      </div>

      <Card title="Active advances">
        {loans.length === 0 ? (
          <EmptyState icon={DocumentTextIcon} title="No active advances">
            When farmers borrow, every advance and its health appears here.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Crop</th>
                  <th>Security</th>
                  <th>Owed</th>
                  <th>Crop worth</th>
                  <th>Sold below</th>
                  <th>Due</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => {
                  const lot = lotById.get(loan.lotId);
                  const health = loanHealth(loan);
                  return (
                    <tr key={loan.id.toString()}>
                      <td>{lot ? <LotLabel lot={lot} commodities={byId} /> : `Lot ${loan.lotId}`}</td>
                      <td>{kg(loan.collateralKg)}</td>
                      <td>{usd(loan.debt)}</td>
                      <td>{lot ? usd(lotValue(lot, byId.get(lot.commodityId), loan.collateralKg)) : "—"}</td>
                      <td>{pricePerKg(loan.liquidationPrice)}</td>
                      <td>
                        {date(loan.maturity)}
                        <div className="muted">{relativeDays(loan.maturity)}</div>
                      </td>
                      <td>
                        <Badge tone={health.tone}>{health.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Prices the pool uses">
        <table className="table">
          <thead>
            <tr>
              <th>Crop</th>
              <th>Price</th>
              <th>Borrow limit</th>
              <th>Settled at</th>
              <th>Price status</th>
            </tr>
          </thead>
          <tbody>
            {commodities.map((c) => (
              <tr key={c.id.toString()}>
                <td>
                  <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                    <CropSeal name={c.name} size={26} />
                    <strong>{c.name}</strong>
                  </span>
                </td>
                <td>{pricePerKg(c.price)}</td>
                <td>{percentFromBps(c.maxLtvBps)}</td>
                <td>{percentFromBps(c.liquidationLtvBps)}</td>
                <td>{c.fresh ? <Badge tone="green">Current</Badge> : <Badge tone="gold">Out of date</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppLayout>
  );
}
