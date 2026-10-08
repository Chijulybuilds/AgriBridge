import Link from "next/link";
import { useConnection } from "wagmi";

import { ArchiveBoxIcon, ArrowRightIcon, BanknotesIcon, BuildingLibraryIcon, ClockIcon, TruckIcon } from "@heroicons/react/24/outline";

import AppLayout from "../../components/layout/AppLayout";
import { GradeBadge, LotLabel } from "../../components/lots";
import { Card, EmptyState, PageHeader, Skeleton, Stat, StatusBadge } from "../../components/ui";
import { lotValue, useCommodities, useLoans, useLots, usePoolStats, useWarehouses } from "../../hooks/useProtocolData";
import { date, kg, usd } from "../../lib/format";

/** The farmer's home: what is stored, what is owed, and the next thing to do. */
export default function FarmerOverview() {
  const { address } = useConnection();
  const { byId: commodities } = useCommodities();
  const { byId: warehouses } = useWarehouses();
  const { lots, isLoading } = useLots(address);
  const { loans } = useLoans(address);
  const { stats } = usePoolStats();

  const mine = lots.filter((l) => address && l.farmer.toLowerCase() === address.toLowerCase());
  const held = lots.filter((l) => l.balanceKg > 0n);
  const pending = mine.filter((l) => l.status === "Pending");
  const stockValue = held.reduce((sum, l) => sum + (lotValue(l, commodities.get(l.commodityId), l.balanceKg) ?? 0n), 0n);
  const active = loans.filter((l) => l.status === "Active");
  const owed = active.reduce((sum, l) => sum + l.debt, 0n);
  const usable = held.filter((l) => l.usable);

  const next =
    mine.length === 0
      ? { text: "Book your first delivery to a warehouse. Once it's weighed and graded, it shows up as stock you can borrow against or sell.", href: "/farmer/deliver", cta: "Deliver a crop" }
      : usable.length > 0 && active.length === 0
        ? { text: "Your crop is verified. Get a cash advance against it, or sell it on the market.", href: "/farmer/advance", cta: "Get an advance" }
        : active.length > 0
          ? { text: "Keep an eye on your advances: repay before the end date to get your crop back.", href: "/farmer/loans", cta: "My advances" }
          : { text: "Your delivery is waiting for the warehouse to weigh and grade it.", href: "/farmer/deliver", cta: "See deliveries" };

  return (
    <AppLayout role="farmer" title="Farmer">
      <PageHeader eyebrow="Farmer" title="Farmer overview" subtitle="Your crop in storage, your advances, and what to do next." />

      <div className="grid-4">
        <Stat lead icon={ArchiveBoxIcon} label="Crop in storage" value={usd(stockValue)} sub={`${held.length} lot${held.length === 1 ? "" : "s"}`} testId="stat-stock" />
        <Stat icon={ClockIcon} label="Waiting for checks" value={String(pending.length)} sub="Deliveries not yet graded" />
        <Stat icon={BanknotesIcon} label="Owed on advances" value={usd(owed)} sub={`${active.length} active`} />
        <Stat icon={BuildingLibraryIcon} label="Pool cash available" value={usd(stats?.availableCash)} sub="What can be advanced now" />
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <Card title="Recent deliveries">
          {isLoading ? (
            <Skeleton rows={4} />
          ) : mine.length === 0 ? (
            <EmptyState icon={TruckIcon} title="No deliveries yet">
              Book one and bring the crop to the warehouse.
            </EmptyState>
          ) : (
            <table className="table">
              <tbody>
                {mine.slice(-5).reverse().map((lot) => (
                  <tr key={lot.id.toString()}>
                    <td>
                      <LotLabel lot={lot} commodities={commodities} sub={warehouses.get(lot.warehouseId)?.name} />
                    </td>
                    <td>{kg(lot.status === "Verified" ? lot.measuredKg : lot.estimatedKg)}</td>
                    <td>{lot.status === "Verified" ? <GradeBadge grade={lot.currentGrade} /> : <StatusBadge status={lot.status} />}</td>
                    <td className="muted">{date(lot.requestedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link className="link" href="/farmer/deliver" style={{ display: "inline-block", marginTop: 12 }}>
            All deliveries →
          </Link>
        </Card>

        <section className="card island">
          <span className="page-eyebrow">Next step</span>
          <h2 className="display" style={{ fontSize: 34, margin: "2px 0 12px" }}>
            {next.cta}
          </h2>
          <p className="text-secondary" style={{ marginBottom: 18, lineHeight: 1.6 }}>
            {next.text}
          </p>
          <Link className="btn btn-block" href={next.href} data-testid="next-step">
            {next.cta} <ArrowRightIcon />
          </Link>
        </section>
      </div>
    </AppLayout>
  );
}
