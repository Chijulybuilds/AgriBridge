import Link from "next/link";
import { useState } from "react";
import { maxUint256 } from "viem";
import { useConnection } from "wagmi";
import { DocumentTextIcon } from "@heroicons/react/24/outline";

import AppLayout from "../../components/layout/AppLayout";
import { loanHealth, lotName } from "../../components/lots";
import { TxStatus } from "../../components/TxStatus";
import { Badge, Card, EmptyState, KeyValue, Notice, PageHeader, Skeleton, StatusBadge } from "../../components/ui";
import { useCommodities, useLoans, useLots, useUsdc, type Loan } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { LendingPoolAbi } from "../../lib/contracts/abis";
import { contracts } from "../../lib/contracts/config";
import { date, kg, parseUsd, pricePerKg, relativeDays, usd } from "../../lib/format";

/** The farmer's advances: what is owed, how safe each one is, and repayment. */
export default function MyAdvances() {
  const { address } = useConnection();
  const { loans, isLoading } = useLoans(address);
  const { lots } = useLots(address);
  const { byId: commodities } = useCommodities();
  const { balance } = useUsdc(address);
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const active = loans.filter((l) => l.status === "Active");
  const closed = loans.filter((l) => l.status !== "Active");
  // A fully repaid advance's card disappears, so its confirmation is shown here instead.
  const [repaid, setRepaid] = useState<string>();

  return (
    <AppLayout role="farmer" title="My advances">
      <PageHeader
        eyebrow="Farmer"
        title="My advances"
        subtitle="Repay before the end date to get your crop back. Interest builds up every second, so repaying early costs less."
        actions={<Link className="btn" href="/farmer/advance">New advance</Link>}
      />

      {repaid && (
        <Notice tone="ok" testId="repaid">
          {repaid}
        </Notice>
      )}

      {isLoading ? (
        <Card>
          <Skeleton rows={4} />
        </Card>
      ) : loans.length === 0 ? (
        <Card>
          <EmptyState icon={DocumentTextIcon} title="No advances yet">
            Advances you take against your crop appear here, with what you owe and how safe each one is.
          </EmptyState>
        </Card>
      ) : (
        <div className="stack">
          {active.map((loan) => {
            const lot = lotById.get(loan.lotId);
            const commodity = lot ? commodities.get(lot.commodityId) : undefined;
            return (
              <AdvanceCard
                key={loan.id.toString()}
                loan={loan}
                name={lot ? lotName(lot, commodities) : `Lot ${loan.lotId}`}
                todayPrice={commodity?.price}
                balance={balance}
                onRepaid={(name) => setRepaid(`${name}: repaid in full. Your crop is back in My stock.`)}
              />
            );
          })}
          {closed.length > 0 && (
            <Card title="Closed advances">
              <table className="table">
                <tbody>
                  {closed.map((loan) => {
                    const lot = lotById.get(loan.lotId);
                    return (
                      <tr key={loan.id.toString()}>
                        <td>{lot ? lotName(lot, commodities) : `Lot ${loan.lotId}`}</td>
                        <td>{usd(loan.principal)} borrowed</td>
                        <td>{date(loan.openedAt)}</td>
                        <td>
                          <StatusBadge status={loan.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </AppLayout>
  );
}

function AdvanceCard({
  loan,
  name,
  todayPrice,
  balance,
  onRepaid,
}: {
  loan: Loan;
  name: string;
  todayPrice?: bigint;
  balance?: bigint;
  onRepaid: (name: string) => void;
}) {
  const tx = useTx();
  const [amount, setAmount] = useState("");
  const health = loanHealth(loan);
  const pool = contracts.pool!;

  async function repay(all: boolean) {
    const payment = all ? undefined : parseUsd(amount);
    if (!all && !payment) return;
    try {
      // Interest keeps accruing until the payment lands, so allow a little extra for "repay all".
      const allowance = all ? loan.debt + loan.debt / 1000n + 1_000_000n : payment!;
      await tx.ensureUsdc(pool, allowance);
      await tx.send(
        { address: pool, abi: LendingPoolAbi, functionName: "repay", args: [loan.id, all ? maxUint256 : payment!] },
        all ? "Repay in full" : "Repay",
      );
      if (all) onRepaid(name);
      setAmount("");
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <Card title={name} actions={<Badge tone={health.tone}>{health.label}</Badge>} testId={`advance-${loan.id}`}>
      <div className="grid-2" style={{ marginBottom: 0 }}>
        <div>
          <KeyValue label="Owed now" value={usd(loan.debt)} testId="owed" />
          <KeyValue label="Borrowed" value={usd(loan.principal)} />
          <KeyValue label="Crop held as security" value={kg(loan.collateralKg)} />
          <KeyValue label="Repay by" value={`${date(loan.maturity)} (${relativeDays(loan.maturity)})`} />
          <KeyValue
            label="Sold if the price falls below"
            value={loan.liquidationPrice !== undefined ? `${pricePerKg(loan.liquidationPrice)} (now ${pricePerKg(todayPrice)})` : "—"}
          />
        </div>
        <div>
          <div className="field">
            <label htmlFor={`repay-${loan.id}`}>Repay part (US$)</label>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input id={`repay-${loan.id}`} className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className="btn btn-secondary" disabled={tx.isBusy || !parseUsd(amount)} onClick={() => void repay(false)}>
                Repay
              </button>
            </div>
            <span className="hint">You have {usd(balance)}.</span>
          </div>
          <button className="btn btn-block" disabled={tx.isBusy} onClick={() => void repay(true)} data-testid="repay-all">
            Repay all and get my crop back
          </button>
          <TxStatus tx={tx} success="Repaid. Your crop is back in My stock." />
        </div>
      </div>
    </Card>
  );
}
