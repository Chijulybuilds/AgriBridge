import Link from "next/link";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";

import {
  lotValue,
  useLotTimeline,
  useMaxBorrow,
  usePoolStats,
  useWelcomeCredit,
  type Commodity,
  type Lot,
} from "../hooks/useProtocolData";
import type { Tx } from "../hooks/useTx";
import { LendingPoolAbi } from "../lib/contracts/abis";
import { contracts, MIN_ADVANCE, WAD } from "../lib/contracts/config";
import { date, kg, money, ngn, nowSeconds, SECONDS_PER_DAY, usd } from "../lib/format";
import { Card, KeyValue, Money, Notice, Segmented } from "./ui";
import { InfoTip } from "./help/InfoTip";

const MATURITY_BUFFER_DAYS = 30; // LendingPool.MATURITY_BUFFER
const GATE_TERM_DAYS = 60;
const MONTH = 30 * SECONDS_PER_DAY;

/**
 * "Now" for a lot's dates: the device clock, or the moment the warehouse verified the lot if that
 * is later. The chain's clock is at least that, so dates counted from here are never in its past,
 * even on a device whose clock is behind.
 */
export function lotNow(lot: Lot): number {
  return Math.max(nowSeconds(), Number(lot.verifiedAt));
}

/** The latest end date a lot allows: a month and a day before it expires (seconds), or undefined. */
function latestEnd(lot: Lot): number | undefined {
  if (!lot.expiresAt) return undefined;
  const latest = Number(lot.expiresAt) - (MATURITY_BUFFER_DAYS + 1) * SECONDS_PER_DAY;
  return latest > lotNow(lot) + 2 * SECONDS_PER_DAY ? latest : undefined;
}

/** The free, verified lot worth most today: the one the farmer home makes its offers on. */
export function bestFreeLot(lots: Lot[], commodities: Map<bigint, Commodity>): Lot | undefined {
  let best: Lot | undefined;
  let bestValue = 0n;
  for (const lot of lots) {
    if (!lot.usable || lot.balanceKg === 0n || !latestEnd(lot)) continue;
    const value = lotValue(lot, commodities.get(lot.commodityId), lot.balanceKg) ?? 0n;
    if (!best || value > bestValue) {
      best = lot;
      bestValue = value;
    }
  }
  return best;
}

/** What the page shows once the advance at the gate has landed (the card itself goes, with the free crop). */
export const GATE_ADVANCE_DONE =
  "Done: the dollars are in your account. When you're ready, sell at your price from My advances: each sale pays the advance back first.";

/**
 * The advance at the gate: once the warehouse has verified a delivery, the farmer sees what they
 * can take against it today and takes it in one step, repayable in 60 days (or the latest the
 * crop allows). Selling later repays it from the sale. The page owns `tx` and shows its status,
 * since this card disappears once the crop is pledged.
 */
export function GateAdvance({ lot, commodity, tx }: { lot: Lot; commodity: Commodity | undefined; tx: Tx }) {
  const { address } = useConnection();
  const { stats } = usePoolStats();
  // Fixed when the card first shows, so the limit query doesn't change every second.
  const [maturity] = useState(() => {
    const latest = latestEnd(lot);
    return latest ? Math.min(lotNow(lot) + GATE_TERM_DAYS * SECONDS_PER_DAY, latest) : undefined;
  });
  const { data: maxBorrow } = useMaxBorrow(lot.id, lot.balanceKg, maturity, address);
  const cap = maxBorrow !== undefined && stats && stats.availableCash < maxBorrow ? stats.availableCash : maxBorrow;
  // Whole dollars, so the button reads cleanly and never asks for more than the limit.
  const offer = cap !== undefined ? (cap / 1_000_000n) * 1_000_000n : undefined;
  const value = lotValue(lot, commodity, lot.balanceKg);
  const canTake = offer !== undefined && offer >= MIN_ADVANCE;
  const { data: welcome } = useWelcomeCredit(address, lot.id, canTake ? offer : undefined);

  async function take() {
    if (!canTake || !maturity) return;
    try {
      await tx.ensureCropApproval(contracts.pool!);
      await tx.send(
        { address: contracts.pool!, abi: LendingPoolAbi, functionName: "borrow", args: [lot.id, lot.balanceKg, offer!, BigInt(maturity)] },
        "Take the advance",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <section className="card island" data-tour="next-step" data-testid="gate-offer">
      <span className="page-eyebrow with-info">
        Ready today <InfoTip id="gate-advance" />
      </span>
      <h2 className="display" style={{ fontSize: 32, margin: "2px 0 2px" }} data-testid="gate-amount">
        {offer === undefined ? "Working out your advance…" : canTake ? `Take up to ${ngn(offer)} today` : "Not enough for an advance yet"}
      </h2>
      {canTake && (
        <p className="text-secondary" style={{ margin: "0 0 10px", fontSize: 13 }} data-testid="gate-dollars">
          {usd(offer, 0)}, paid in dollars at ₦1,500 to $1
        </p>
      )}
      {canTake && welcome !== undefined && welcome > 0n && (
        <Notice tone="ok" testId="gate-welcome">
          Your first 30 days are free: AgriBridge pays about {money(welcome)} of the interest.{" "}
          <InfoTip id="welcome-credit" />
        </Notice>
      )}
      <p className="text-secondary" style={{ marginBottom: 14, lineHeight: 1.6 }}>
        Your {commodity?.name.toLowerCase() ?? "crop"} is verified: {kg(lot.balanceKg)}, worth {money(value)} today. Take cash now and
        sell later at your price. When it sells, the advance is paid back from the sale.
      </p>
      {maturity && <KeyValue label="Repay by" help="end-date" value={`${date(maturity)}, or as soon as it sells`} />}
      <button className="btn btn-block" style={{ marginTop: 12 }} disabled={tx.isBusy || !canTake} onClick={() => void take()} data-testid="gate-take">
        {tx.isBusy ? "Working…" : canTake ? `Take ${ngn(offer)} now` : "Take an advance"}
      </button>
      <Link className="link" href={`/farmer/advance?lot=${lot.id}`} style={{ display: "inline-block", marginTop: 12 }}>
        Choose another amount or date →
      </Link>
    </section>
  );
}

/** Seasonal notes from published price studies, for the crops we have one for (see the white paper). */
function pastSeasons(name: string | undefined): string | undefined {
  const crop = name?.toLowerCase() ?? "";
  if (crop.includes("maize")) return "In past years, white maize sold for about a third more in the lean season than just after harvest.";
  if (crop.includes("yam")) return "In 2018, yam sold for about 35% more in June than in January, as old yam ran out.";
  return undefined;
}

/**
 * "Sell now or wait?": what selling today brings against waiting a few months on an advance,
 * from the contracts' own numbers (storage, interest, the crop's ageing). Prices are not
 * forecast: the card says how much they would need to rise to make waiting pay.
 */
export function SellOrWait({ lot, commodity }: { lot: Lot; commodity: Commodity | undefined }) {
  const { address } = useConnection();
  const { stats } = usePoolStats();
  const latest = latestEnd(lot);
  const choices = [1, 2, 3, 4, 6].filter((m) => latest !== undefined && lotNow(lot) + m * MONTH <= latest);
  const [months, setMonths] = useState(String(choices.includes(3) ? 3 : (choices[choices.length - 1] ?? 1)));
  const m = Number(months);
  // Fixed per choice, so the queries don't change every second.
  const [start] = useState(() => lotNow(lot));
  const end = start + m * MONTH;
  const { data: factors } = useLotTimeline(lot.id, [start, end]);
  const { data: advance } = useMaxBorrow(lot.id, lot.balanceKg, end, address);
  const { data: welcome } = useWelcomeCredit(address, lot.id, advance);

  const result = useMemo(() => {
    const valueNow = lotValue(lot, commodity, lot.balanceKg);
    if (valueNow === undefined || !factors || factors[0] === 0n || !commodity) return undefined;
    // The same crop in m months at today's price, after its ageing.
    const valueLater = (valueNow * factors[1]) / factors[0];
    const storage = (commodity.storageFeePerTonMonth * lot.balanceKg * BigInt(m)) / 10n ** 21n;
    const fullInterest = advance && stats ? (advance * stats.borrowRate * BigInt(m * 30)) / (WAD * 365n) : 0n;
    // On a farmer's first advance, the welcome fund pays the first 30 days.
    const free = welcome ?? 0n;
    const interest = fullInterest > free ? fullInterest - free : 0n;
    const costs = storage + interest;
    if (valueLater === 0n) return undefined;
    const breakEvenBps = ((valueNow + costs) * 10_000n) / valueLater - 10_000n;
    const outcome = (riseBps: bigint) => (valueLater * (10_000n + riseBps)) / 10_000n - costs;
    return { valueNow, valueLater, storage, interest, breakEvenBps, outcome };
  }, [lot, commodity, factors, advance, welcome, stats, m]);

  if (choices.length === 0) return null;
  const note = pastSeasons(commodity?.name);
  const signed = (value: bigint) => (value >= 0n ? `${money(value)} more` : `${money(-value)} less`);

  return (
    <Card title="Sell now or wait?" help="sell-or-wait" tour="sell-or-wait" testId="sell-or-wait">
      <div className="field">
        <span className="field-label" id="wait-months">
          Wait for
        </span>
        <Segmented
          options={choices.map((c) => ({ id: String(c), label: c === 1 ? "1 month" : `${c} months` }))}
          value={months}
          onChange={setMonths}
          testIdPrefix="wait"
          labelledBy="wait-months"
        />
      </div>
      {result ? (
        <>
          <div className="grid-2" style={{ marginBottom: 24 }}>
            <div className="card-sunken">
              <span className="page-eyebrow">Sell now</span>
              <div className="display" style={{ fontSize: 30 }} data-testid="sell-now-value">
                {ngn(result.valueNow)}
              </div>
              <span className="muted">{usd(result.valueNow)}</span>
            </div>
            <div className="card-sunken">
              <span className="page-eyebrow">Wait {m === 1 ? "1 month" : `${m} months`}</span>
              <div className="display" style={{ fontSize: 30 }} data-testid="break-even">
                {result.breakEvenBps <= 0n ? "Pays even if prices hold" : `Needs prices up ${(Number(result.breakEvenBps) / 100).toFixed(0)}%`}
              </div>
              <span className="muted">by {date(end)}, to beat selling now</span>
            </div>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>If the price by then is</th>
                  <th>You end up with</th>
                  <th>Compared with selling now</th>
                </tr>
              </thead>
              <tbody>
                {[0n, 1_500n, 3_000n].map((rise) => {
                  const ending = result.outcome(rise);
                  return (
                    <tr key={rise.toString()}>
                      <td>{rise === 0n ? "the same as today" : `${Number(rise) / 100}% higher`}</td>
                      <td>
                        <Money value={ending} />
                      </td>
                      <td>{signed(ending - result.valueNow)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Waiting counts the crop&apos;s ageing, {money(result.storage)} of storage, and {money(result.interest)} of interest on a{" "}
            {money(advance)} advance taken now{welcome ? ", after your free first month" : ""}. {note ? `${note} ` : ""}Prices can fall too,
            and nobody can promise they will rise.
          </p>
        </>
      ) : (
        <p className="muted">Working it out…</p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <Link className="btn btn-secondary btn-small" href={`/market/sell?lot=${lot.id}`} data-testid="sell-now">
          Sell now at your price
        </Link>
        <Link className="btn btn-secondary btn-small" href={`/market/sell?lot=${lot.id}&advance=1`}>
          Sell at your price and get paid today
        </Link>
      </div>
    </Card>
  );
}
