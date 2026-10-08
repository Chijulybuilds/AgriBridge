import Link from "next/link";
import { useMemo, useState } from "react";
import { ArchiveBoxIcon, BuildingStorefrontIcon } from "@heroicons/react/24/outline";

import AppLayout from "../../components/layout/AppLayout";
import { GradeBadge, LotLabel } from "../../components/lots";
import { BulkDealNote, BuyPanel, ListingPrice } from "../../components/market";
import { MarketOverview, PriceAgeing, type CropStock } from "../../components/marketOverview";
import { Card, CropSeal, EmptyState, Notice, PageHeader, Skeleton } from "../../components/ui";
import { useCommodities, useListings, useLots, useWarehouses, type Lot } from "../../hooks/useProtocolData";
import { GRADES } from "../../lib/contracts/config";
import { date, kg, relativeDays, shortAddress } from "../../lib/format";
import { useRememberedRole } from "../../lib/session";

/**
 * The market, open to everyone: graded crop in the warehouses, sold by the
 * kilogram. Feed makers can buy lower grades for less; prices that follow the
 * market move with the price and with the crop's age. Signing in is needed only to buy.
 */
export default function Market() {
  const role = useRememberedRole("buyer");
  const { commodities, byId: commodityById } = useCommodities();
  const { warehouses, byId: warehouseById } = useWarehouses();
  const { lots } = useLots();
  const { listings, isLoading } = useListings();

  const [commodityFilter, setCommodityFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [buying, setBuying] = useState<bigint>();
  const [bought, setBought] = useState<string>();

  const lotById = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots]);
  const matches = (lot: Lot | undefined) =>
    Boolean(lot) &&
    (!commodityFilter || lot!.commodityId.toString() === commodityFilter) &&
    (!gradeFilter || lot!.currentGrade === gradeFilter) &&
    (!warehouseFilter || lot!.warehouseId.toString() === warehouseFilter);

  const forSale = listings.filter((l) => l.active && !l.clearance && matches(lotById.get(l.lotId)));
  const clearanceCount = listings.filter((l) => l.active && l.clearance).length;

  // Stock in the warehouses: every verified, unexpired lot, by crop, grade and warehouse, and how much of it is for sale.
  const stock = useMemo(() => {
    const rows = new Map<string, { commodityId: bigint; grade: string; warehouseId: bigint; storedKg: bigint; forSaleKg: bigint }>();
    for (const lot of lots) {
      if (lot.status !== "Verified" || lot.expired || !lot.supplyKg) continue;
      const key = `${lot.commodityId}-${lot.currentGrade}-${lot.warehouseId}`;
      const row = rows.get(key) ?? { commodityId: lot.commodityId, grade: lot.currentGrade ?? "A", warehouseId: lot.warehouseId, storedKg: 0n, forSaleKg: 0n };
      row.storedKg += lot.supplyKg;
      rows.set(key, row);
    }
    for (const listing of listings) {
      const lot = lotById.get(listing.lotId);
      if (!listing.active || listing.clearance || !lot) continue;
      const row = rows.get(`${lot.commodityId}-${lot.currentGrade}-${lot.warehouseId}`);
      if (row) row.forSaleKg += listing.kgRemaining;
    }
    return [...rows.values()].sort((a, b) => Number(a.commodityId - b.commodityId) || a.grade.localeCompare(b.grade));
  }, [lots, listings, lotById]);

  // The overview always shows the whole market; the filters only narrow the listings.
  const allForSale = listings.filter((l) => l.active && !l.clearance);
  const totalForSale = stock.reduce((sum, r) => sum + r.forSaleKg, 0n);
  const valueForSale = isLoading
    ? undefined
    : Number(allForSale.reduce((sum, l) => sum + ((l.pricePerKg ?? 0n) * l.kgRemaining) / 10n ** 18n, 0n)) / 1e6;
  const byCrop: CropStock[] = commodities
    .filter((c) => c.active)
    .map((commodity) => {
      const rows = stock.filter((r) => r.commodityId === commodity.id);
      return {
        commodity,
        storedKg: rows.reduce((sum, r) => sum + r.storedKg, 0n),
        forSaleKg: rows.reduce((sum, r) => sum + r.forSaleKg, 0n),
      };
    });

  return (
    <AppLayout role={role} title="Market" requireWallet={false}>
      <PageHeader
        eyebrow="Buy and sell"
        title="Market"
        subtitle="Graded crop stored in our warehouses, sold by the kilogram. Lower grades cost less, which suits feed makers. Buy, then collect it or resell it."
        actions={
          <>
            <Link className="btn btn-secondary" href="/market/clearance">
              Expired stock{clearanceCount ? ` (${clearanceCount})` : ""}
            </Link>
            <Link className="btn" href="/market/sell">
              Sell
            </Link>
          </>
        }
      />

      {bought && (
        <Notice tone="ok" testId="purchase-done">
          {bought}
        </Notice>
      )}

      <MarketOverview
        valueForSale={valueForSale}
        kgForSale={totalForSale}
        listingCount={allForSale.length}
        crops={byCrop}
        warehouses={warehouses.filter((w) => w.active)}
        selectedCrop={commodityFilter}
        onSelectCrop={setCommodityFilter}
        selectedWarehouse={warehouseFilter}
        onSelectWarehouse={setWarehouseFilter}
      />

      <Card title="Filter">
        <div className="grid-3" style={{ marginBottom: 0 }}>
          <select className="select" value={commodityFilter} onChange={(e) => setCommodityFilter(e.target.value)} data-testid="filter-commodity">
            <option value="">All crops</option>
            {commodities.map((c) => (
              <option key={c.id.toString()} value={c.id.toString()}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="select" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} data-testid="filter-grade">
            <option value="">All grades</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
          <select className="select" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id.toString()} value={w.id.toString()}>
                {w.name}, {w.region}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <div style={{ height: 28 }} />

      <Card title="For sale" testId="listings">
        {isLoading ? (
          <Skeleton rows={4} />
        ) : forSale.length === 0 ? (
          <EmptyState icon={BuildingStorefrontIcon} title="Nothing for sale matches">
            Check back soon, or change the filters. Farmers list straight from their stock.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Crop</th>
                  <th>Grade</th>
                  <th>Warehouse</th>
                  <th>Available</th>
                  <th>Price</th>
                  <th>Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {forSale.map((listing) => {
                  const lot = lotById.get(listing.lotId)!;
                  const open = buying === listing.id;
                  return (
                    <ListingRows
                      key={listing.id.toString()}
                      cells={
                        <>
                          <td>
                            <LotLabel
                              lot={lot}
                              commodities={commodityById}
                              sub={<span style={{ whiteSpace: "nowrap" }}>Seller {shortAddress(listing.seller)}</span>}
                            />
                          </td>
                          <td>
                            <GradeBadge grade={lot.currentGrade} />
                          </td>
                          <td>{warehouseById.get(lot.warehouseId)?.name}</td>
                          <td>
                            {kg(listing.kgRemaining)}
                            <div>
                              <BulkDealNote listing={listing} />
                            </div>
                          </td>
                          <td>
                            <ListingPrice listing={listing} />
                          </td>
                          <td>
                            {date(lot.expiresAt)}
                            <div className="muted">{relativeDays(lot.expiresAt)}</div>
                          </td>
                          <td>
                            <button className="btn btn-small" onClick={() => setBuying(open ? undefined : listing.id)} data-testid={`buy-${listing.id}`}>
                              {open ? "Close" : "Buy"}
                            </button>
                          </td>
                        </>
                      }
                      panel={
                        open ? (
                          <BuyPanel
                            listing={listing}
                            onBought={(summary) => {
                              setBought(summary);
                              setBuying(undefined);
                            }}
                          />
                        ) : null
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ height: 28 }} />

      <Card title="Prices and ageing">
        <p className="text-secondary" style={{ marginTop: -6, marginBottom: 20, maxWidth: "68ch" }}>
          Each crop&apos;s price for a kilogram at grade A, and what that kilogram is worth as it ages. Older stock costs less.
        </p>
        <PriceAgeing commodities={commodities} />
      </Card>

      <div style={{ height: 28 }} />

      <Card title="Stock in the warehouses" testId="stock-overview">
        {stock.length === 0 ? (
          <EmptyState icon={ArchiveBoxIcon}>No verified stock yet.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Crop</th>
                <th>Grade</th>
                <th>Warehouse</th>
                <th>Stored</th>
                <th>For sale</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => (
                <tr key={`${row.commodityId}-${row.grade}-${row.warehouseId}`}>
                  <td>
                    <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                      <CropSeal name={commodityById.get(row.commodityId)?.name} size={26} />
                      <strong>{commodityById.get(row.commodityId)?.name}</strong>
                    </span>
                  </td>
                  <td>
                    <GradeBadge grade={row.grade} />
                  </td>
                  <td>{warehouseById.get(row.warehouseId)?.name}</td>
                  <td>{kg(row.storedKg)}</td>
                  <td>{row.forSaleKg > 0n ? kg(row.forSaleKg) : <span className="muted">not listed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AppLayout>
  );
}

function ListingRows({ cells, panel }: { cells: React.ReactNode; panel: React.ReactNode }) {
  return (
    <>
      <tr>{cells}</tr>
      {panel && (
        <tr>
          <td colSpan={7}>{panel}</td>
        </tr>
      )}
    </>
  );
}
