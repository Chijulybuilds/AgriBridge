import { useRouter } from "next/router";
import { useEffect, useState, type FormEvent } from "react";
import { useConnection } from "wagmi";

import AppLayout from "../../components/layout/AppLayout";
import { GradeBadge, lotName } from "../../components/lots";
import { BulkDealNote, ListingPrice } from "../../components/market";
import { TxStatus } from "../../components/TxStatus";
import { Card, EmptyState, KeyValue, Notice, PageHeader, Segmented } from "../../components/ui";
import {
  referenceValuePerKg,
  useCommodities,
  useListings,
  useLots,
  useMarketSettings,
  type Listing,
} from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { MarketplaceAbi } from "../../lib/contracts/abis";
import { contracts, PriceMode } from "../../lib/contracts/config";
import { date, kg, kgNumber, parseKg, parsePercentToBps, parseUsd, percentFromBps, usdPerKg } from "../../lib/format";
import { useRememberedRole } from "../../lib/session";

type Pricing = "market" | "fixed";

/** Terms a seller sets: a price (fixed, or a share of today's value) and an optional bulk deal. */
function useTerms(defaultPricing: Pricing = "market") {
  const [pricing, setPricing] = useState<Pricing>(defaultPricing);
  const [fixedPrice, setFixedPrice] = useState("");
  const [percent, setPercent] = useState("100");
  const [bulk, setBulk] = useState(false);
  const [bulkMin, setBulkMin] = useState("");
  const [bulkOff, setBulkOff] = useState("");

  /** The contract's (mode, price, bulkMinKg, bulkDiscountBps), or an error to show. */
  function read(): { args: [number, bigint, bigint, bigint] } | { error: string } {
    let price: bigint | undefined;
    if (pricing === "fixed") {
      price = parseUsd(fixedPrice);
      if (!price) return { error: "Enter your price per kilogram." };
    } else {
      const bps = parsePercentToBps(percent, 200);
      if (!bps) return { error: "Enter a share of today's value between 1% and 200%." };
      price = BigInt(bps);
    }
    let minKg = 0n;
    let off = 0n;
    if (bulk) {
      minKg = parseKg(bulkMin) ?? 0n;
      const offBps = parsePercentToBps(bulkOff, 50);
      if (!minKg || !offBps) return { error: "For a bulk deal, enter the minimum order and a discount up to 50%." };
      off = BigInt(offBps);
    }
    return { args: [pricing === "fixed" ? PriceMode.Fixed : PriceMode.Reference, price, minKg, off] };
  }

  const fields = (referencePerKg: bigint | undefined) => (
    <>
      <div className="field">
        <label>Price</label>
        <Segmented
          options={[
            { id: "market", label: "Follow the market" },
            { id: "fixed", label: "Fixed price" },
          ]}
          value={pricing}
          onChange={setPricing}
          testIdPrefix="pricing"
        />
      </div>
      {pricing === "market" ? (
        <div className="field">
          <label htmlFor="percent">Share of today&apos;s value (%)</label>
          <input id="percent" className="input" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
          <span className="hint">
            The price moves with the crop&apos;s price and its age.{" "}
            {referencePerKg !== undefined && parsePercentToBps(percent, 200)
              ? `Today that is ${usdPerKg((referencePerKg * BigInt(parsePercentToBps(percent, 200)!)) / 10_000n)}.`
              : ""}
          </span>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="fixed">Price per kilogram (US$)</label>
          <input id="fixed" className="input" inputMode="decimal" value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} />
          {referencePerKg !== undefined && <span className="hint">Today&apos;s value is {usdPerKg(referencePerKg)}.</span>}
        </div>
      )}
      <label className="row" style={{ fontSize: 13, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={bulk} onChange={(e) => setBulk(e.target.checked)} data-testid="bulk-toggle" />
        Offer a bulk deal to large buyers
      </label>
      {bulk && (
        <div className="grid-2" style={{ marginBottom: 6 }}>
          <div className="field">
            <label htmlFor="bulk-min">From (kg)</label>
            <input id="bulk-min" className="input" inputMode="decimal" value={bulkMin} onChange={(e) => setBulkMin(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bulk-off">Discount (%)</label>
            <input id="bulk-off" className="input" inputMode="decimal" value={bulkOff} onChange={(e) => setBulkOff(e.target.value)} />
          </div>
        </div>
      )}
    </>
  );

  return { read, fields };
}

/**
 * Sell crop on the market: list all or part of a lot at a fixed price or a share
 * of its value today, with an optional bulk deal. The crop is held by the market
 * until it sells or the listing is taken down.
 */
export default function Sell() {
  const router = useRouter();
  const role = useRememberedRole("farmer");
  const { address } = useConnection();
  const { byId: commodities } = useCommodities();
  const { lots } = useLots(address);
  const { listings } = useListings();
  const { settings } = useMarketSettings();
  const tx = useTx();
  const terms = useTerms();

  const sellable = lots.filter((l) => l.usable && l.balanceKg > 0n);
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const lot = sellable.find((l) => l.id.toString() === lotId);
  const referencePerKg = lot ? referenceValuePerKg(lot, commodities.get(lot.commodityId)) : undefined;
  const mine = listings.filter((l) => l.active && !l.clearance && address && l.seller.toLowerCase() === address.toLowerCase());

  useEffect(() => {
    if (lotId || sellable.length === 0) return;
    const wanted = typeof router.query.lot === "string" ? router.query.lot : undefined;
    const pick = sellable.find((l) => l.id.toString() === wanted) ?? (sellable.length === 1 ? sellable[0] : undefined);
    if (!pick) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- defaults depend on data that arrives after mount
    setLotId(pick.id.toString());
    setQuantity(String(kgNumber(pick.balanceKg)));
  }, [sellable, lotId, router.query.lot]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const kgAmount = parseKg(quantity);
    if (!lot) return setFormError("Choose what to sell.");
    if (!kgAmount || kgAmount > lot.balanceKg) return setFormError(`Enter up to ${kg(lot.balanceKg)}.`);
    const result = terms.read();
    if ("error" in result) return setFormError(result.error);
    const [mode, price, bulkMinKg, bulkDiscountBps] = result.args;

    try {
      await tx.ensureCropApproval(contracts.marketplace!);
      await tx.send(
        { address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "list", args: [lot.id, kgAmount, mode, price, bulkMinKg, bulkDiscountBps] },
        "List for sale",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <AppLayout role={role} title="Sell">
      <PageHeader
        title="Sell"
        subtitle="Put your crop on the market. Buyers can take any part of it. Selling early gets more, since the crop's value falls as it ages."
      />

      {/* Outside the form, which empties once all the stock is listed. */}
      <TxStatus tx={tx} success="Listed. Buyers can see it on the market now." />

      <div className="grid-2">
        <Card title="New listing">
          {sellable.length === 0 ? (
            <EmptyState>You have no verified stock to sell.</EmptyState>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="lot">Stock</label>
                <select id="lot" className="select" value={lotId} onChange={(e) => setLotId(e.target.value)} data-testid="lot">
                  <option value="">Choose…</option>
                  {sellable.map((l) => (
                    <option key={l.id.toString()} value={l.id.toString()}>
                      {lotName(l, commodities)}, Grade {l.currentGrade}, {kg(l.balanceKg)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="kg">Kilograms to sell</label>
                <input id="kg" className="input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              {terms.fields(referencePerKg)}
              {formError && <p className="form-error" data-testid="form-error">{formError}</p>}
              <button className="btn btn-block" type="submit" disabled={tx.isBusy} data-testid="submit-listing">
                {tx.isBusy ? "Listing…" : "List for sale"}
              </button>
            </form>
          )}
        </Card>

        <Card title="Good to know">
          {lot && (
            <div style={{ marginBottom: 12 }}>
              <KeyValue label="Crop" value={<><GradeBadge grade={lot.currentGrade} /> {lotName(lot, commodities)}</>} />
              <KeyValue label="Value today" value={referencePerKg !== undefined ? usdPerKg(referencePerKg) : "Price out of date"} />
              <KeyValue label="Expires" value={date(lot.expiresAt)} />
            </div>
          )}
          <Notice>
            AgriBridge keeps {settings ? percentFromBps(settings.feeBps) : "1%"} of each sale. You get the rest in dollars straight away.
            Unsold crop comes back when you take the listing down.
          </Notice>
        </Card>
      </div>

      <Card title="My listings">
        {mine.length === 0 ? (
          <EmptyState>No open listings.</EmptyState>
        ) : (
          <div className="stack">
            {mine.map((listing) => (
              <MyListing key={listing.id.toString()} listing={listing} name={lotName(lots.find((l) => l.id === listing.lotId) ?? { id: listing.lotId, commodityId: 0n }, commodities)} />
            ))}
          </div>
        )}
      </Card>
    </AppLayout>
  );
}

function MyListing({ listing, name }: { listing: Listing; name: string }) {
  const tx = useTx();
  const [editing, setEditing] = useState(false);
  const terms = useTerms(listing.mode === PriceMode.Fixed ? "fixed" : "market");
  const [error, setError] = useState<string | null>(null);

  async function reprice() {
    setError(null);
    const result = terms.read();
    if ("error" in result) return setError(result.error);
    try {
      await tx.send(
        { address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "reprice", args: [listing.id, ...result.args] },
        "Change the price",
      );
      setEditing(false);
    } catch {
      // Shown by TxStatus.
    }
  }

  async function cancel() {
    try {
      await tx.send({ address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "cancel", args: [listing.id] }, "Take down");
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="spread">
        <div>
          <strong>{name}</strong>
          <div className="muted">
            {kg(listing.kgRemaining)} left · listing {listing.id.toString()}
          </div>
          <BulkDealNote listing={listing} />
        </div>
        <ListingPrice listing={listing} />
        <div className="row">
          <button className="btn btn-secondary btn-small" onClick={() => setEditing(!editing)}>
            {editing ? "Close" : "Change price"}
          </button>
          <button className="btn btn-danger btn-small" disabled={tx.isBusy} onClick={() => void cancel()}>
            Take down
          </button>
        </div>
      </div>
      {editing && (
        <div style={{ marginTop: 12 }}>
          {terms.fields(undefined)}
          {error && <p className="form-error">{error}</p>}
          <button className="btn" disabled={tx.isBusy} onClick={() => void reprice()}>
            Save price
          </button>
        </div>
      )}
      <TxStatus tx={tx} success="Saved." />
      <p className="hint" style={{ marginTop: 8 }}>
        Each sale is paid to you as it happens; Activity shows every sale.
      </p>
    </div>
  );
}
