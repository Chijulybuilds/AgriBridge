import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { CheckBadgeIcon, TagIcon } from "@heroicons/react/24/outline";

import AppLayout from "../../components/layout/AppLayout";
import { LotLabel, lotName } from "../../components/lots";
import { BuyPanel, ListingPrice } from "../../components/market";
import { TxStatus } from "../../components/TxStatus";
import { Card, EmptyState, KeyValue, Notice, PageHeader } from "../../components/ui";
import { useClearanceQuote, useCommodities, useListings, useLots, useMarketSettings, useWarehouses } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { MarketplaceAbi } from "../../lib/contracts/abis";
import { contracts } from "../../lib/contracts/config";
import { kg, kgInput, parseKgUpTo, percentFromBps, usd } from "../../lib/format";
import { useRememberedRole } from "../../lib/session";

/**
 * Expired stock. Holders can sell it to AgriBridge, below its value, so nobody
 * is left with crop they cannot use; AgriBridge then lists it for buyers who
 * don't need top quality, such as animal-feed makers.
 */
export default function Clearance() {
  const router = useRouter();
  const role = useRememberedRole("buyer");
  const { address, isConnected } = useConnection();
  const { byId: commodities } = useCommodities();
  const { byId: warehouses } = useWarehouses();
  const { lots } = useLots(address);
  const { listings } = useListings();
  const { settings } = useMarketSettings();
  const tx = useTx();

  const expired = lots.filter((l) => l.expired && !l.frozen && l.balanceKg > 0n);
  const clearanceListings = listings.filter((l) => l.active && l.clearance);
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const [buying, setBuying] = useState<bigint>();
  const [bought, setBought] = useState<string>();

  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");
  const lot = expired.find((l) => l.id.toString() === lotId);
  const kgAmount = lot ? parseKgUpTo(quantity, lot.balanceKg) : undefined;
  const { data: payout } = useClearanceQuote(lot?.id, kgAmount);
  const fundTooLow = payout !== undefined && settings !== undefined && payout > settings.clearanceFund;

  useEffect(() => {
    if (lotId || expired.length === 0) return;
    const wanted = typeof router.query.lot === "string" ? router.query.lot : undefined;
    const pick = expired.find((l) => l.id.toString() === wanted) ?? expired[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- defaults depend on data that arrives after mount
    setLotId(pick.id.toString());
    setQuantity(kgInput(pick.balanceKg));
  }, [expired, lotId, router.query.lot]);

  async function sell() {
    if (!lot || !kgAmount) return;
    try {
      await tx.ensureCropApproval(contracts.marketplace!);
      await tx.send(
        { address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "sellExpired", args: [lot.id, kgAmount] },
        "Sell to AgriBridge",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <AppLayout role={role} title="Expired stock" requireWallet={false}>
      <PageHeader
        eyebrow="Market"
        title="Expired stock"
        subtitle="Crop past its shelf life can't be borrowed against or sold as food grade. AgriBridge buys it below its value and resells it for animal feed."
      />

      {/* Outside the forms, so the result stays on screen after the stock it was about is gone. */}
      <TxStatus tx={tx} success="Sold. The dollars are in your account." />
      {bought && (
        <Notice tone="ok" testId="purchase-done">
          {bought}
        </Notice>
      )}

      {isConnected && (
        <Card title="Sell expired stock to AgriBridge">
          {expired.length === 0 ? (
            <EmptyState icon={CheckBadgeIcon} title="You have no expired stock">
              Nothing you hold is past its shelf life. If some ever is, you can sell it to AgriBridge here.
            </EmptyState>
          ) : (
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div>
                <div className="field">
                  <label htmlFor="lot">Stock</label>
                  <select id="lot" className="select" value={lotId} onChange={(e) => setLotId(e.target.value)}>
                    {expired.map((l) => (
                      <option key={l.id.toString()} value={l.id.toString()}>
                        {lotName(l, commodities)}, {kg(l.balanceKg)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="kg">Kilograms</label>
                  <input id="kg" className="input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <button className="btn btn-gold btn-block" disabled={tx.isBusy || !payout || fundTooLow} onClick={() => void sell()} data-testid="sell-expired">
                  {tx.isBusy ? "Selling…" : `Sell for ${usd(payout)}`}
                </button>
              </div>
              <div>
                <KeyValue label="AgriBridge pays" value={settings ? `${percentFromBps(10_000n - settings.clearanceDiscountBps)} of its value` : "—"} />
                <KeyValue label="You get" value={usd(payout)} />
                <KeyValue label="Clearance fund" value={usd(settings?.clearanceFund)} />
                {fundTooLow && <Notice tone="warn">The clearance fund is too low for this right now. Try a smaller amount or check back later.</Notice>}
              </div>
            </div>
          )}
        </Card>
      )}

      <div style={{ height: 28 }} />

      <Card title="Feed-grade stock for sale">
        {clearanceListings.length === 0 ? (
          <EmptyState icon={TagIcon} title="None right now">
            AgriBridge lists the expired stock it buys here, at a low fixed price, for buyers such as animal-feed makers.
          </EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Crop</th>
                <th>Warehouse</th>
                <th>Available</th>
                <th>Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clearanceListings.map((listing) => {
                const listingLot = lotById.get(listing.lotId);
                const open = buying === listing.id;
                return (
                  <ClearanceRows
                    key={listing.id.toString()}
                    cells={
                      <>
                        <td>{listingLot ? <LotLabel lot={listingLot} commodities={commodities} sub="Feed grade" /> : `Lot ${listing.lotId}`}</td>
                        <td>{listingLot ? warehouses.get(listingLot.warehouseId)?.name : "—"}</td>
                        <td>{kg(listing.kgRemaining)}</td>
                        <td>
                          <ListingPrice listing={listing} />
                        </td>
                        <td>
                          <button className="btn btn-small" onClick={() => setBuying(open ? undefined : listing.id)}>
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
        )}
      </Card>
    </AppLayout>
  );
}

function ClearanceRows({ cells, panel }: { cells: React.ReactNode; panel: React.ReactNode }) {
  return (
    <>
      <tr>{cells}</tr>
      {panel && (
        <tr>
          <td colSpan={5}>{panel}</td>
        </tr>
      )}
    </>
  );
}
