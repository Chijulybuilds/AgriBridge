import { useState, type FormEvent } from "react";
import { useConnection } from "wagmi";
import { ArrowTrendingUpIcon, BuildingLibraryIcon, ClockIcon, ShieldCheckIcon, WalletIcon } from "@heroicons/react/24/outline";

import AppLayout from "../../components/layout/AppLayout";
import { TxStatus } from "../../components/TxStatus";
import { Card, EmptyState, KeyValue, PageHeader, Segmented, Stat } from "../../components/ui";
import { usePoolHistory } from "../../hooks/useActivity";
import { useInvestorPosition, usePoolStats, useUsdc } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { LendingPoolAbi } from "../../lib/contracts/abis";
import { contracts } from "../../lib/contracts/config";
import { date, parseUsd, percentFromWad, usd } from "../../lib/format";
import { publicClient } from "../../lib/chain";

type Mode = "invest" | "withdraw";

/**
 * The investor's home: how the pool is doing, what their money in it is worth,
 * investing and withdrawing, and their history.
 */
export default function InvestorOverview() {
  const { address } = useConnection();
  const { stats } = usePoolStats();
  const { position } = useInvestorPosition(address);
  const { balance } = useUsdc(address);
  const { data: history } = usePoolHistory(address);
  const tx = useTx();

  const [mode, setMode] = useState<Mode>("invest");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const invested = (history ?? []).reduce((sum, m) => (m.kind === "Invested" ? sum + m.amount : sum - m.amount), 0n);
  // Without any history yet (e.g. still loading), the whole position would look like earnings.
  const earned = position && history?.length ? position.value - invested : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const value = parseUsd(amount);
    if (!value) return setFormError("Enter an amount above zero.");
    const pool = contracts.pool!;

    try {
      if (mode === "invest") {
        if (balance !== undefined && value > balance) return setFormError(`You have ${usd(balance)}.`);
        await tx.ensureUsdc(pool, value);
        await tx.send({ address: pool, abi: LendingPoolAbi, functionName: "deposit", args: [value] }, "Invest");
      } else {
        if (!position || value > position.value) return setFormError(`Your money in the pool is worth ${usd(position?.value)}.`);
        if (stats && value > stats.availableCash) {
          return setFormError(`Only ${usd(stats.availableCash)} is free right now; the rest is lent to farmers and comes back as they repay.`);
        }
        // The pool works in shares; withdrawing everything uses all of them so nothing is left behind.
        const shares =
          value === position.value
            ? position.shares
            : await publicClient.readContract({ address: pool, abi: LendingPoolAbi, functionName: "convertToShares", args: [value] });
        await tx.send({ address: pool, abi: LendingPoolAbi, functionName: "withdraw", args: [shares] }, "Withdraw");
      }
      setAmount("");
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <AppLayout role="investor" title="Investor">
      <PageHeader
        eyebrow="Investor"
        title="Investor overview"
        subtitle="Your money is lent to farmers against crop held in warehouses. Interest is added every second; 80% goes to investors and 20% builds a cushion that absorbs losses first."
      />

      <div className="grid-4">
        <Stat lead icon={WalletIcon} label="Your money in the pool" value={usd(position?.value)} sub={earned !== undefined ? `${usd(earned)} earned so far` : undefined} testId="position" />
        <Stat icon={ArrowTrendingUpIcon} label="Investors earn now" value={stats ? `${percentFromWad(stats.supplyRate)} a year` : "—"} sub="Changes with how much is lent out" />
        <Stat icon={BuildingLibraryIcon} label="Pool size" value={usd(stats?.totalAssets)} sub={stats ? `${percentFromWad(stats.utilization, 0)} lent to farmers` : undefined} />
        <Stat icon={ShieldCheckIcon} label="Loss cushion" value={usd(stats?.reserves)} sub="Covers bad debt before investors" />
      </div>

      <div className="grid-2">
        <Card title={mode === "invest" ? "Invest" : "Withdraw"}>
          <div style={{ marginBottom: 14 }}>
            <Segmented
              options={[
                { id: "invest", label: "Invest" },
                { id: "withdraw", label: "Withdraw" },
              ]}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setFormError(null);
              }}
              testIdPrefix="mode"
              label="Invest or withdraw"
            />
          </div>
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="amount">Amount (US$)</label>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input id="amount" className="input" inputMode="decimal" data-testid="amount-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const max = mode === "invest" ? balance : position?.value;
                    if (max) setAmount((Number(max) / 1e6).toFixed(2));
                  }}
                >
                  All
                </button>
              </div>
              <span className="hint">
                {mode === "invest" ? `You have ${usd(balance)} to invest.` : `Free to withdraw now: ${usd(stats?.availableCash)} across the pool.`}
              </span>
            </div>
            {formError && <p className="form-error" role="alert" data-testid="form-error">{formError}</p>}
            <button className="btn btn-block btn-gold" type="submit" disabled={tx.isBusy} data-testid="submit-tx">
              {tx.isBusy ? "Working…" : mode === "invest" ? "Invest" : "Withdraw"}
            </button>
            <TxStatus tx={tx} success={mode === "invest" ? "Invested. Interest starts now." : "Withdrawn to your account."} />
          </form>
        </Card>

        <Card title="How your money is protected">
          <KeyValue label="Farmers can borrow" value="up to 50% of their crop's value (40% for yam)" />
          <KeyValue label="A loan is settled when" value="it reaches 80% of the crop's value, or is 7 days late" />
          <KeyValue label="Crop values" value="come from set prices and fall as the crop ages" />
          <KeyValue label="Losses are covered by" value="the loss cushion first, then investors" />
          <KeyValue label="Borrowers pay now" value={stats ? `${percentFromWad(stats.borrowRate)} a year` : "—"} />
        </Card>
      </div>

      <Card title="Your history">
        {!history || history.length === 0 ? (
          <EmptyState icon={ClockIcon} title="No position yet">
            Your investments and withdrawals will show here.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <tbody>
                {history.map((move) => (
                  <tr key={move.key}>
                    <td>{move.kind}</td>
                    <td>{usd(move.amount)}</td>
                    <td className="muted">{date(move.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
