import Link from "next/link";
import { useState } from "react";
import { useConnection } from "wagmi";

import { useMarketSettings, useQuoteWithFee, useUsdc, type Listing } from "../hooks/useProtocolData";
import { useTx } from "../hooks/useTx";
import { MarketplaceAbi } from "../lib/contracts/abis";
import { contracts, PriceMode } from "../lib/contracts/config";
import { kg, kgInput, nairaPerKg, parseKgUpTo, percentFromBps, usd, usdPerKg } from "../lib/format";
import { TxStatus } from "./TxStatus";
import { InfoTip } from "./help/InfoTip";

/** "$5.73/kg", plus "follows the market (98%)" for listings priced off the reference value. */
export function ListingPrice({ listing }: { listing: Listing }) {
  return (
    <div>
      <strong>{listing.pricePerKg !== undefined ? usdPerKg(listing.pricePerKg) : "Price out of date"}</strong>
      {listing.pricePerKg !== undefined && <div className="muted">{nairaPerKg(listing.pricePerKg)}</div>}
      {listing.mode === PriceMode.Reference && (
        <div className="muted">follows the market ({percentFromBps(listing.price)} of its value)</div>
      )}
    </div>
  );
}

export function BulkDealNote({ listing }: { listing: Listing }) {
  if (listing.bulkDiscountBps === 0n) return null;
  return (
    <span className="badge badge-gold">
      {percentFromBps(listing.bulkDiscountBps)} off from {kg(listing.bulkMinKg)}
    </span>
  );
}

/**
 * Buy part or all of a listing. The price comes from the contract's own quote,
 * bulk deal included, with the market fee added on top (the seller keeps the full
 * price), and the purchase refuses to go through if the total rises more than 1%
 * before it lands. `onBought` gets a sentence for the page to show, since the
 * panel (and the listing, if it sold out) closes once the purchase lands.
 */
export function BuyPanel({ listing, onBought }: { listing: Listing; onBought?: (summary: string) => void }) {
  const { address, isConnected } = useConnection();
  const { balance } = useUsdc(address);
  const { settings } = useMarketSettings();
  const tx = useTx();
  const [quantity, setQuantity] = useState(kgInput(listing.availableKg));
  const kgAmount = parseKgUpTo(quantity, listing.availableKg);
  const tooMuch = kgAmount !== undefined && kgAmount > listing.availableKg;
  const { data: quote } = useQuoteWithFee(listing.id, tooMuch ? undefined : kgAmount);
  const dealApplies = listing.bulkDiscountBps > 0n && kgAmount !== undefined && kgAmount >= listing.bulkMinKg;

  if (!isConnected) {
    return (
      <Link className="btn btn-small" href="/login?role=buyer&next=/market">
        Sign in to buy
      </Link>
    );
  }

  async function buy() {
    if (!kgAmount || !quote || tooMuch) return;
    const maxCost = quote.total + quote.total / 100n + 1n;
    try {
      await tx.ensureUsdc(contracts.marketplace!, maxCost);
      await tx.send(
        { address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "buy", args: [listing.id, kgAmount, maxCost] },
        "Buy",
      );
      onBought?.(`Bought ${kg(kgAmount)} for about ${usd(quote.total)}. It's in My stock: collect it or sell it on.`);
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <div className="card-sunken" data-testid={`buy-panel-${listing.id}`}>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor={`kg-${listing.id}`}>Kilograms (up to {kg(listing.availableKg)})</label>
        <input id={`kg-${listing.id}`} className="input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      {!tooMuch && quote && quote.fee > 0n && (
        <>
          <div className="kv">
            <span>Price</span>
            <span data-testid="buy-price">{usd(quote.cost)}</span>
          </div>
          <div className="kv">
            <span className="with-info">
              Market fee ({settings ? percentFromBps(settings.feeBps) : "1%"}) <InfoTip id="market-fee" />
            </span>
            <span data-testid="buy-fee">{usd(quote.fee)}</span>
          </div>
        </>
      )}
      <div className="kv">
        <span>Total</span>
        <span data-testid="buy-total">{tooMuch ? "More than is left" : usd(quote?.total)}</span>
      </div>
      {dealApplies && <p className="hint">Bulk deal applied: {percentFromBps(listing.bulkDiscountBps)} off.</p>}
      {!dealApplies && listing.bulkDiscountBps > 0n && (
        <p className="hint">Buy {kg(listing.bulkMinKg)} or more to get {percentFromBps(listing.bulkDiscountBps)} off.</p>
      )}
      <p className="hint">
        You have {usd(balance)}.{" "}
        {settings && !listing.clearance
          ? `The farmer gets their full price. The ${percentFromBps(settings.feeBps)} fee is added on top, and half of it goes to the investors whose money funds farmers' advances.`
          : ""}
      </p>
      <button className="btn btn-block" style={{ marginTop: 8 }} disabled={tx.isBusy || !quote || tooMuch} onClick={() => void buy()} data-testid="confirm-buy">
        {tx.isBusy ? "Buying…" : "Buy"}
      </button>
      <TxStatus tx={tx} success="Bought. It's in My stock: collect it or sell it on." />
    </div>
  );
}
