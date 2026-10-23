import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useConnection } from "wagmi";
import { BuildingStorefrontIcon, TagIcon } from "@heroicons/react/24/outline";

import { lotNow } from "../../components/advanceOffers";
import AppLayout from "../../components/layout/AppLayout";
import { GradeBadge, LotLabel, lotName } from "../../components/lots";
import { BulkDealNote, ListingPrice } from "../../components/market";
import { TxStatus } from "../../components/TxStatus";
import { Badge, Card, EmptyState, KeyValue, Money, Notice, PageHeader, Segmented } from "../../components/ui";
import {
  referenceValuePerKg,
  useCommodities,
  useListings,
  useLoans,
  useLots,
  useMarketSettings,
  useMaxBorrow,
  useWelcomeCredit,
  usePoolStats,
  type Commodity,
  type Listing,
  type Loan,
  type Lot,
} from "../../hooks/useProtocolData";
import { useTx, type Tx } from "../../hooks/useTx";
import { MarketplaceAbi } from "../../lib/contracts/abis";
import { contracts, MIN_ADVANCE, PriceMode, WAD } from "../../lib/contracts/config";
import {
  date,
  isoDay,
  kg,
  kgInput,
  maturityTimestamp,
  money,
  moneyPerKg,
  nairaInput,
  nowSeconds,
  parseKg,
  parseKgUpTo,
  parseNaira,
  parsePercentToBps,
  percentFromBps,
  percentFromWad,
  SECONDS_PER_DAY,
  usd,
  usdPerKg,
} from "../../lib/format";
import { useRememberedRole } from "../../lib/session";
import { InfoTip } from "../../components/help/InfoTip";

type Pricing = "market" | "fixed";

/** Marketplace.ADVANCE_PRICE_HEADROOM_BPS: with an advance, ask at least 110% of its share of each kilogram. */
const ADVANCE_HEADROOM_BPS = 11_000n;
const MATURITY_BUFFER_DAYS = 30; // LendingPool.MATURITY_BUFFER
const DEFAULT_TERM_DAYS = 60;
const ONE_KG = 10n ** 18n;

/** The lowest asking price per kilogram that covers `owed` across `kgAmount`, with the market's headroom. */
function minPricePerKg(owed: bigint, kgAmount: bigint): bigint {
  const numerator = owed * ADVANCE_HEADROOM_BPS * ONE_KG;
  const denominator = 10_000n * kgAmount;
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Terms a seller sets: a price (fixed, or a share of today's value) and an optional bulk deal.
 * `idPrefix` keeps field ids unique when several forms are on the page (editing a listing).
 */
function useTerms(defaultPricing: Pricing = "market", idPrefix = "") {
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
      price = parseNaira(fixedPrice);
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

  /** The lowest price a buyer could pay per kilogram today under these terms, after any bulk deal. */
  function lowestPerKg(referencePerKg: bigint | undefined): bigint | undefined {
    const result = read();
    if ("error" in result) return undefined;
    const [mode, price, , off] = result.args;
    const perKg = mode === PriceMode.Fixed ? price : referencePerKg === undefined ? undefined : (referencePerKg * price) / 10_000n;
    return perKg === undefined ? undefined : (perKg * (10_000n - off)) / 10_000n;
  }

  const fields = (referencePerKg: bigint | undefined) => (
    <>
      <div className="field">
        <span className="field-label" id={`${idPrefix}pricing`} data-tour="price-mode">
          Price <InfoTip id="market-price" />
        </span>
        <Segmented
          options={[
            { id: "market", label: "Follow the market" },
            { id: "fixed", label: "Fixed price" },
          ]}
          value={pricing}
          onChange={setPricing}
          testIdPrefix="pricing"
          labelledBy={`${idPrefix}pricing`}
        />
      </div>
      {pricing === "market" ? (
        <div className="field">
          <label htmlFor={`${idPrefix}percent`}>Share of today&apos;s value (%)</label>
          <input id={`${idPrefix}percent`} className="input" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
          <span className="hint">
            The price moves with the crop&apos;s price and its age.{" "}
            {referencePerKg !== undefined && parsePercentToBps(percent, 200)
              ? `Today that is ${moneyPerKg((referencePerKg * BigInt(parsePercentToBps(percent, 200)!)) / 10_000n)}.`
              : ""}
          </span>
        </div>
      ) : (
        <div className="field">
          <label htmlFor={`${idPrefix}fixed`}>Price per kilogram (₦)</label>
          <input id={`${idPrefix}fixed`} className="input" inputMode="decimal" value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} />
          <span className="hint">
            {parseNaira(fixedPrice) ? `That is ${usdPerKg(parseNaira(fixedPrice))} in dollars. ` : ""}
            {referencePerKg !== undefined ? `Today's value is ${moneyPerKg(referencePerKg)}.` : ""}
          </span>
        </div>
      )}
      <label className="row" style={{ fontSize: 14, gap: 8, minHeight: 40, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={bulk} onChange={(e) => setBulk(e.target.checked)} data-testid="bulk-toggle" />
        <span data-tour="bulk-deal">Offer a bulk deal to large buyers</span>
        <InfoTip id="bulk-deal" />
      </label>
      {bulk && (
        <div className="grid-2" style={{ marginBottom: 6 }}>
          <div className="field">
            <label htmlFor={`${idPrefix}bulk-min`}>From (kg)</label>
            <input id={`${idPrefix}bulk-min`} className="input" inputMode="decimal" value={bulkMin} onChange={(e) => setBulkMin(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}bulk-off`}>Discount (%)</label>
            <input id={`${idPrefix}bulk-off`} className="input" inputMode="decimal" value={bulkOff} onChange={(e) => setBulkOff(e.target.value)} />
          </div>
        </div>
      )}
    </>
  );

  return { read, lowestPerKg, fields };
}

const LIST_WITH_ADVANCE = "List and get paid today";
const STOP_SELLING = "Stop selling";

/**
 * Sell crop on the market: list all or part of a lot at a fixed price or a share of its value
 * today, with an optional bulk deal. "Get paid today" also takes an advance against the listed
 * crop, so the farmer can hold out for their price: each sale repays its share of the advance
 * and pays the farmer the rest. With ?loan=ID the page lists the crop behind an advance taken
 * earlier, such as at the warehouse gate.
 */
export default function Sell() {
  const router = useRouter();
  const role = useRememberedRole("farmer");
  const { address } = useConnection();
  const { byId: commodities } = useCommodities();
  const { lots } = useLots(address);
  const { listings } = useListings();
  const { loans } = useLoans(address);
  const { settings } = useMarketSettings();
  const { stats } = usePoolStats();
  const tx = useTx();
  // A listing leaves "My listings" once it is taken down, so its status lives on the card.
  const listingTx = useTx();
  const terms = useTerms();

  const sellable = lots.filter((l) => l.usable && l.balanceKg > 0n);
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [withAdvance, setWithAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [endDay, setEndDay] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const lot = sellable.find((l) => l.id.toString() === lotId);
  const commodity = lot ? commodities.get(lot.commodityId) : undefined;
  const referencePerKg = lot ? referenceValuePerKg(lot, commodity) : undefined;
  const mine = listings.filter((l) => l.active && !l.clearance && address && l.seller.toLowerCase() === address.toLowerCase());

  // ?loan=ID: sell the crop behind that advance instead.
  const loanQuery = typeof router.query.loan === "string" ? router.query.loan : undefined;
  const advanceLoan = loanQuery ? loans.find((l) => l.id.toString() === loanQuery && l.status === "Active") : undefined;

  useEffect(() => {
    if (lotId || sellable.length === 0) return;
    const wanted = typeof router.query.lot === "string" ? router.query.lot : undefined;
    const pick = sellable.find((l) => l.id.toString() === wanted) ?? (sellable.length === 1 ? sellable[0] : undefined);
    if (!pick) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- defaults depend on data that arrives after mount
    setLotId(pick.id.toString());
    setQuantity(kgInput(pick.balanceKg));
    if (router.query.advance === "1") setWithAdvance(true);
  }, [sellable, lotId, router.query.lot, router.query.advance]);

  const minDay = isoDay(nowSeconds() + 2 * SECONDS_PER_DAY);
  const maxDay = lot?.expiresAt ? isoDay(Number(lot.expiresAt) - (MATURITY_BUFFER_DAYS + 1) * SECONDS_PER_DAY) : undefined;
  useEffect(() => {
    if (!lot || endDay || !maxDay) return;
    const preferred = isoDay(lotNow(lot) + DEFAULT_TERM_DAYS * SECONDS_PER_DAY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the default end date depends on the chosen lot
    setEndDay(preferred < maxDay ? preferred : maxDay);
  }, [lot, endDay, maxDay]);

  const kgAmount = lot ? parseKgUpTo(quantity, lot.balanceKg) : undefined;
  const maturity = endDay ? maturityTimestamp(endDay) : undefined;
  const { data: maxBorrow } = useMaxBorrow(withAdvance ? lot?.id : undefined, kgAmount, maturity, address);
  const advance = parseNaira(advanceAmount);
  const { data: welcome } = useWelcomeCredit(withAdvance ? address : undefined, lot?.id, advance);
  const floor = withAdvance && advance && kgAmount ? minPricePerKg(advance, kgAmount) : undefined;
  const lowest = terms.lowestPerKg(referencePerKg);
  const totalAtPrice = lowest !== undefined && kgAmount ? (lowest * kgAmount) / ONE_KG : undefined;
  const monthInterest = advance && stats ? (advance * stats.borrowRate * 30n) / (WAD * 365n) : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!lot) return setFormError("Choose what to sell.");
    if (!kgAmount || kgAmount > lot.balanceKg) return setFormError(`Enter up to ${kg(lot.balanceKg)}.`);
    const result = terms.read();
    if ("error" in result) return setFormError(result.error);
    const [mode, price, bulkMinKg, bulkDiscountBps] = result.args;

    if (withAdvance) {
      if (!advance || advance < MIN_ADVANCE) return setFormError(`Advances start at ${money(MIN_ADVANCE)}.`);
      if (maxBorrow !== undefined && advance > maxBorrow) return setFormError(`The most you can take for these kilograms is ${money(maxBorrow)}.`);
      if (stats && advance > stats.availableCash) return setFormError(`The pool has ${money(stats.availableCash)} available right now.`);
      if (!maturity || !maxDay || endDay < minDay || endDay > maxDay) {
        return setFormError(`Choose a repay date between ${date(maturityTimestamp(minDay))} and ${date(maturityTimestamp(maxDay ?? minDay))}.`);
      }
      if (floor !== undefined && lowest !== undefined && lowest < floor) {
        return setFormError(`With a ${money(advance)} advance, ask at least ${moneyPerKg(floor)}, after any bulk deal.`);
      }
    }

    try {
      await tx.ensureCropApproval(contracts.marketplace!);
      if (withAdvance) {
        await tx.send(
          {
            address: contracts.marketplace!,
            abi: MarketplaceAbi,
            functionName: "listWithAdvance",
            args: [lot.id, kgAmount, mode, price, bulkMinKg, bulkDiscountBps, advance!, BigInt(maturity!)],
          },
          LIST_WITH_ADVANCE,
        );
        setAdvanceAmount("");
      } else {
        await tx.send(
          { address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "list", args: [lot.id, kgAmount, mode, price, bulkMinKg, bulkDiscountBps] },
          "List for sale",
        );
      }
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <AppLayout role={role} title="Sell">
      <PageHeader section="sell"
        eyebrow="Market"
        title="Sell"
        subtitle="Put your crop on the market at your price. Buyers can take any part of it. Need cash now? Get paid today and keep your price."
      />

      {/* Outside the form, which empties once all the stock is listed. */}
      <TxStatus
        tx={tx}
        success={
          tx.step === LIST_WITH_ADVANCE
            ? "Listed, and the advance is in your account. Each sale pays back its share of the advance first; you get the rest as it sells."
            : "Listed. Buyers can see it on the market now."
        }
      />

      <div className="grid-2">
        {loanQuery ? (
          advanceLoan ? (
            <SellAdvanceCrop
              loan={advanceLoan}
              lot={lots.find((l) => l.id === advanceLoan.lotId)}
              commodities={commodities}
            />
          ) : (
            <Card title="Sell the crop behind an advance">
              <EmptyState art="market" icon={TagIcon} title="That advance is not open">
                It may have been repaid already. <Link className="link" href="/farmer/loans">See My advances</Link>.
              </EmptyState>
            </Card>
          )
        ) : (
          <Card title="New listing" tour="sell-form" help="sell">
            {sellable.length === 0 ? (
              <EmptyState art="market"
                icon={TagIcon}
                title="Nothing to sell yet"
                action={
                  <Link className="btn btn-small" href="/farmer/deliver">
                    Deliver a crop
                  </Link>
                }
              >
                You have no verified stock to sell. Crop shows up here once the warehouse has weighed and graded it, or after you buy on the market.
              </EmptyState>
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

                <label className="row" style={{ fontSize: 14, gap: 8, minHeight: 40, marginBottom: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={withAdvance} onChange={(e) => setWithAdvance(e.target.checked)} data-testid="advance-toggle" />
                  <span data-tour="get-paid-today">
                    <strong>Get paid today:</strong> take part of the money now
                  </span>
                  <InfoTip id="get-paid-today" />
                </label>
                {withAdvance && (
                  <div className="card-sunken" style={{ marginBottom: 12 }} data-testid="advance-fields">
                    <div className="field">
                      <label htmlFor="advance-amount">Take now (₦)</label>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <input
                          id="advance-amount"
                          className="input"
                          inputMode="decimal"
                          value={advanceAmount}
                          onChange={(e) => setAdvanceAmount(e.target.value)}
                          data-testid="advance-amount"
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={!maxBorrow}
                          onClick={() => maxBorrow && setAdvanceAmount(nairaInput(maxBorrow))}
                          data-testid="advance-max"
                        >
                          Max
                        </button>
                      </div>
                      <span className="hint" data-testid="advance-limit">
                        {advance !== undefined ? `You receive ${usd(advance)}. ` : ""}
                        {maxBorrow !== undefined
                          ? `Up to ${money(maxBorrow)} for these kilograms.`
                          : "Choose the stock and kilograms to see how much you can take."}
                      </span>
                    </div>
                    {welcome !== undefined && welcome > 0n && (
                      <Notice tone="ok" testId="welcome-offer">
                        Your first advance: AgriBridge pays the first 30 days of interest, about {money(welcome)}.{" "}
                        <InfoTip id="welcome-credit" />
                      </Notice>
                    )}
                    <div className="field">
                      <label htmlFor="advance-end">If it hasn&apos;t all sold, repay by</label>
                      <input
                        id="advance-end"
                        className="input"
                        type="date"
                        min={minDay}
                        max={maxDay}
                        value={endDay}
                        onChange={(e) => setEndDay(e.target.value)}
                        data-testid="advance-end-date"
                      />
                      <span className="hint">Each sale pays back its share first. Whatever is still owed on this date, you repay yourself.</span>
                    </div>
                    {floor !== undefined && (
                      <p className="hint" style={{ margin: 0 }} data-testid="advance-min-price">
                        With this advance, ask at least {moneyPerKg(floor)}.
                      </p>
                    )}
                  </div>
                )}

                {formError && <p className="form-error" role="alert" data-testid="form-error">{formError}</p>}
                <button className="btn btn-block" type="submit" disabled={tx.isBusy} data-testid="submit-listing">
                  {tx.isBusy ? "Listing…" : withAdvance ? "List and get paid today" : "List for sale"}
                </button>
              </form>
            )}
          </Card>
        )}

        <Card title="Good to know">
          {lot && !loanQuery && (
            <div style={{ marginBottom: 12 }}>
              <KeyValue label="Crop" value={<><GradeBadge grade={lot.currentGrade} /> {lotName(lot, commodities)}</>} />
              <KeyValue label="Value today" value={referencePerKg !== undefined ? <Money value={referencePerKg} perKg /> : "Price out of date"} />
              <KeyValue label="Expires" value={date(lot.expiresAt)} />
              {withAdvance && advance !== undefined && totalAtPrice !== undefined && (
                <div data-testid="advance-summary">
                  <KeyValue label="Paid to you today" value={<Money value={advance} />} />
                  <KeyValue label="If it all sells at your price" value={<Money value={totalAtPrice} />} />
                  <KeyValue
                    label="Then paid to you as it sells"
                    value={totalAtPrice > advance ? `about ${money(totalAtPrice - advance)}, less interest` : "—"}
                  />
                  <KeyValue
                    label="Interest"
                    help="interest"
                    value={
                      stats
                        ? `${percentFromWad(stats.borrowRate)} a year, only until it sells (about ${money(monthInterest)} a month)${welcome ? "; the first 30 days are paid for you" : ""}`
                        : "—"
                    }
                  />
                </div>
              )}
            </div>
          )}
          <Notice>
            Buyers pay AgriBridge&apos;s {settings ? percentFromBps(settings.feeBps) : "1%"}{" "}fee on top of your price, so you get your full
            price, in dollars, as it sells. Half the fee goes to the investors whose money funds farmers&apos; advances, and a tenth pays
            new farmers&apos; first month of interest. Unsold crop comes back when you take the listing down.
          </Notice>
        </Card>
      </div>

      <Card title="My listings">
        {mine.length === 0 ? (
          <EmptyState art="market" icon={BuildingStorefrontIcon}>No open listings. What you list shows here, where you can change its price or take it down.</EmptyState>
        ) : (
          <div className="stack">
            {mine.map((listing) => (
              <MyListing
                key={listing.id.toString()}
                tx={listingTx}
                listing={listing}
                label={
                  <LotLabel
                    lot={lots.find((l) => l.id === listing.lotId) ?? { id: listing.lotId, commodityId: 0n }}
                    commodities={commodities}
                    sub={`${kg(listing.availableKg)} left · listing ${listing.id}`}
                  />
                }
              />
            ))}
          </div>
        )}
        <TxStatus
          tx={listingTx}
          success={
            listingTx.step === "Take down"
              ? "Taken down. The unsold crop is back in your stock."
              : listingTx.step === STOP_SELLING
                ? "Stopped selling. The crop stays as security for your advance; repay it or list it again."
                : "Price changed."
          }
        />
        {mine.length > 0 && (
          <p className="hint" style={{ marginTop: 12 }}>
            Each sale is paid to you as it happens; Activity shows every sale.
          </p>
        )}
      </Card>
    </AppLayout>
  );
}

/**
 * Lists the crop behind an advance the farmer already has (one taken at the warehouse gate, say):
 * each sale repays its share of the advance first, and the farmer gets the rest at once.
 */
function SellAdvanceCrop({ loan, lot, commodities }: { loan: Loan; lot: Lot | undefined; commodities: Map<bigint, Commodity> }) {
  const tx = useTx();
  const terms = useTerms("market", "advance-");
  const [error, setError] = useState<string | null>(null);
  const referencePerKg = lot ? referenceValuePerKg(lot, commodities.get(lot.commodityId)) : undefined;
  const floor = loan.collateralKg > 0n ? minPricePerKg(loan.debt, loan.collateralKg) : undefined;
  const listed = loan.listingId !== 0n;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const result = terms.read();
    if ("error" in result) return setError(result.error);
    const lowest = terms.lowestPerKg(referencePerKg);
    if (floor !== undefined && lowest !== undefined && lowest < floor) {
      return setError(`Ask at least ${moneyPerKg(floor)}, after any bulk deal, so each sale can pay back its share of the advance.`);
    }
    try {
      await tx.send(
        { address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "listCollateral", args: [loan.id, ...result.args] },
        "List the advance's crop",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <Card title="Sell the crop behind your advance" testId="sell-advance-crop" tour="sell-form" help="get-paid-today">
      {lot && <LotLabel lot={lot} commodities={commodities} sub={`Advance ${loan.id}`} />}
      <div style={{ margin: "12px 0" }}>
        <KeyValue label="Crop held as security" value={kg(loan.collateralKg)} />
        <KeyValue label="Owed now" value={<Money value={loan.debt} />} />
        {floor !== undefined && <KeyValue label="Lowest price you can ask" value={<Money value={floor} perKg />} testId="advance-min-price" />}
      </div>
      {listed ? (
        <Notice tone="ok">This crop is already for sale (listing {loan.listingId.toString()}). Change its price under My listings.</Notice>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="hint" style={{ marginTop: 0 }}>
            Each sale pays back its share of the advance first, and you get the rest at once. When the last kilogram sells, the advance
            is repaid in full and counts on your record.
          </p>
          {terms.fields(referencePerKg)}
          {error && <p className="form-error" role="alert" data-testid="form-error">{error}</p>}
          <button className="btn btn-block" type="submit" disabled={tx.isBusy} data-testid="submit-advance-listing">
            {tx.isBusy ? "Listing…" : "List for sale"}
          </button>
        </form>
      )}
      <TxStatus tx={tx} success="Listed. Each sale pays back its share of your advance first; you get the rest at once." />
    </Card>
  );
}

function MyListing({ tx, listing, label }: { tx: Tx; listing: Listing; label: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const terms = useTerms(listing.mode === PriceMode.Fixed ? "fixed" : "market", `listing-${listing.id}-`);
  const [error, setError] = useState<string | null>(null);
  const backsAdvance = listing.loanId !== 0n;

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
      await tx.send(
        { address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "cancel", args: [listing.id] },
        backsAdvance ? STOP_SELLING : "Take down",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <div className="card-sunken" data-testid={`my-listing-${listing.id}`}>
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <div>
          {label}
          <div style={{ marginLeft: 43 }} className="row">
            <BulkDealNote listing={listing} />
            {backsAdvance && (
              <span className="with-info" data-testid="pays-back-advance">
                <Badge tone="green">Pays back advance {listing.loanId.toString()}</Badge>
                <InfoTip id="get-paid-today" />
              </span>
            )}
          </div>
        </div>
        <ListingPrice listing={listing} />
        <div className="row">
          <button className="btn btn-secondary btn-small" onClick={() => setEditing(!editing)}>
            {editing ? "Close" : "Change price"}
          </button>
          <button className="btn btn-danger btn-small" disabled={tx.isBusy} onClick={() => void cancel()}>
            {backsAdvance ? "Stop selling" : "Take down"}
          </button>
        </div>
      </div>
      {editing && (
        <div style={{ marginTop: 12 }}>
          {terms.fields(undefined)}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn" disabled={tx.isBusy} onClick={() => void reprice()}>
            Save price
          </button>
        </div>
      )}
    </div>
  );
}
