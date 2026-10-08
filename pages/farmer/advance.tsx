import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useConnection } from "wagmi";
import { BanknotesIcon } from "@heroicons/react/24/outline";

import AppLayout from "../../components/layout/AppLayout";
import { GradeBadge, lotName } from "../../components/lots";
import { TxStatus } from "../../components/TxStatus";
import { Card, EmptyState, KeyValue, Notice, PageHeader } from "../../components/ui";
import { lotValue, useCommodities, useLots, useMaxBorrow, usePoolStats } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { LendingPoolAbi } from "../../lib/contracts/abis";
import { contracts, WAD } from "../../lib/contracts/config";
import {
  date,
  isoDay,
  kg,
  kgInput,
  maturityTimestamp,
  nowSeconds,
  parseKgUpTo,
  parseUsd,
  percentFromBps,
  percentFromWad,
  SECONDS_PER_DAY,
  usd,
} from "../../lib/format";

const MIN_ADVANCE = 100n * 10n ** 6n; // $100, LendingPool.MIN_BORROW_AMOUNT
const MATURITY_BUFFER_DAYS = 30; // LendingPool.MATURITY_BUFFER

/**
 * Get an advance: borrow dollars against verified crop in storage. The limit is
 * set by what the crop will be worth on the end date the farmer picks, since it
 * loses value as it ages.
 */
export default function Advance() {
  const router = useRouter();
  const { address } = useConnection();
  const { byId: commodities } = useCommodities();
  const { lots } = useLots(address);
  const { stats } = usePoolStats();
  const tx = useTx();

  const eligible = lots.filter((l) => l.usable && l.balanceKg > 0n);
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [endDay, setEndDay] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const lot = eligible.find((l) => l.id.toString() === lotId);
  const commodity = lot ? commodities.get(lot.commodityId) : undefined;

  // Preselect the lot from the link (?lot=3) or the only one there is, and offer all of it.
  useEffect(() => {
    if (lotId || eligible.length === 0) return;
    const wanted = typeof router.query.lot === "string" ? router.query.lot : undefined;
    const pick = eligible.find((l) => l.id.toString() === wanted) ?? (eligible.length === 1 ? eligible[0] : undefined);
    if (!pick) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- defaults depend on data that arrives after mount
    setLotId(pick.id.toString());
    setQuantity(kgInput(pick.balanceKg));
  }, [eligible, lotId, router.query.lot]);

  const minDay = isoDay(nowSeconds() + 2 * SECONDS_PER_DAY);
  const maxDay = lot?.expiresAt ? isoDay(Number(lot.expiresAt) - (MATURITY_BUFFER_DAYS + 1) * SECONDS_PER_DAY) : undefined;
  const kgAmount = lot ? parseKgUpTo(quantity, lot.balanceKg) : undefined;
  const maturity = endDay ? maturityTimestamp(endDay) : undefined;
  const { data: maxBorrow } = useMaxBorrow(lot?.id, kgAmount, maturity);
  const advance = parseUsd(amount);

  const days = maturity ? Math.max(0, Math.round((maturity - nowSeconds()) / SECONDS_PER_DAY)) : 0;
  const interest = useMemo(() => {
    if (!advance || !stats) return undefined;
    return (advance * stats.borrowRate * BigInt(days)) / (WAD * 365n);
  }, [advance, stats, days]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!lot || !commodity) return setFormError("Choose the crop to borrow against.");
    if (!kgAmount || kgAmount > lot.balanceKg) return setFormError(`Enter up to ${kg(lot.balanceKg)}.`);
    if (!maturity || !maxDay || endDay < minDay || endDay > maxDay) {
      return setFormError(`Choose an end date between ${date(maturityTimestamp(minDay))} and ${date(maturityTimestamp(maxDay ?? minDay))}.`);
    }
    if (!advance || advance < MIN_ADVANCE) return setFormError("Advances start at $100.");
    if (maxBorrow !== undefined && advance > maxBorrow) return setFormError(`The most this crop can borrow is ${usd(maxBorrow)}.`);
    if (stats && advance > stats.availableCash) return setFormError(`The pool has ${usd(stats.availableCash)} available right now.`);

    try {
      await tx.ensureCropApproval(contracts.pool!);
      await tx.send(
        { address: contracts.pool!, abi: LendingPoolAbi, functionName: "borrow", args: [lot.id, kgAmount, advance, BigInt(maturity)] },
        "Take the advance",
      );
      setAmount("");
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <AppLayout role="farmer" title="Get an advance">
      <PageHeader
        eyebrow="Farmer"
        title="Get an advance"
        subtitle="Borrow dollars against crop in storage. The crop stays in the warehouse as security and comes back to you when you repay."
      />

      {/* Outside the form, which empties once all the crop is pledged. */}
      <TxStatus tx={tx} success="Done: the dollars are in your account. See My advances to repay." />

      {eligible.length === 0 ? (
        <Card>
          <EmptyState
            icon={BanknotesIcon}
            title="Nothing free to borrow against"
            action={
              <Link className="btn btn-small" href="/farmer/deliver">
                Deliver a crop
              </Link>
            }
          >
            Once the warehouse has weighed and graded your crop, you can borrow against it here.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid-2">
          <Card title="Your advance">
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="lot">Crop</label>
                <select id="lot" className="select" data-testid="lot" value={lotId} onChange={(e) => setLotId(e.target.value)}>
                  <option value="">Choose…</option>
                  {eligible.map((l) => (
                    <option key={l.id.toString()} value={l.id.toString()}>
                      {lotName(l, commodities)}, Grade {l.currentGrade}, {kg(l.balanceKg)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="kg">Kilograms to use</label>
                <input id="kg" className="input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                {lot && <span className="hint">You hold {kg(lot.balanceKg)}. The rest stays free to sell.</span>}
              </div>
              <div className="field">
                <label htmlFor="end">Repay by</label>
                <input id="end" className="input" type="date" min={minDay} max={maxDay} value={endDay} onChange={(e) => setEndDay(e.target.value)} data-testid="end-date" />
                {lot && <span className="hint">At least a month before the crop expires on {date(lot.expiresAt)}.</span>}
              </div>
              <div className="field">
                <label htmlFor="amount">Amount (US$)</label>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input id="amount" className="input" inputMode="decimal" data-testid="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!maxBorrow}
                    onClick={() => maxBorrow && setAmount((Number(maxBorrow) / 1e6).toFixed(2))}
                  >
                    Max
                  </button>
                </div>
                <span className="hint" data-testid="max-advance">
                  {maxBorrow !== undefined ? `Up to ${usd(maxBorrow)} for this crop and date.` : "Choose the crop, kilograms and date to see your limit."}
                </span>
              </div>
              {formError && <p className="form-error" role="alert" data-testid="form-error">{formError}</p>}
              <button className="btn btn-block" type="submit" disabled={tx.isBusy} data-testid="submit-advance">
                {tx.isBusy ? "Working…" : "Get the advance"}
              </button>
            </form>
          </Card>

          <Card title="How it works">
            {lot && commodity && (
              <div style={{ marginBottom: 14 }}>
                <KeyValue label="Crop" value={<><GradeBadge grade={lot.currentGrade} /> {commodity.name}</>} />
                <KeyValue label="Worth today" value={usd(lotValue(lot, commodity, kgAmount ?? 0n))} />
                <KeyValue label="Borrow limit" value={`${percentFromBps(commodity.maxLtvBps)} of its value on the end date`} />
                <KeyValue label="Interest now" value={stats ? `${percentFromWad(stats.borrowRate)} a year` : "—"} />
                {interest !== undefined && days > 0 && <KeyValue label={`Interest for ${days} days (estimate)`} value={usd(interest)} />}
              </div>
            )}
            <Notice tone="warn">
              If the crop&apos;s value falls until the advance is {lot && commodity ? percentFromBps(commodity.liquidationLtvBps) : "80%"} of
              it, or you are more than 7 days late, part of the crop is sold to repay the advance plus 5%. The rest comes back to you, and
              you keep the dollars you borrowed.
            </Notice>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
