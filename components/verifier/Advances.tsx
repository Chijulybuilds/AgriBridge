import { useQuery } from "@tanstack/react-query";
import { ArchiveBoxIcon, BanknotesIcon, BellAlertIcon, DocumentTextIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

import { lotValue, useCommodities, useLoans, useLots, usePoolStats } from "../../hooks/useProtocolData";
import { useTx, type Tx } from "../../hooks/useTx";
import { LendingPoolAbi, LiquidationKeeperAbi } from "../../lib/contracts/abis";
import { contracts, VERIFIER_SAFE } from "../../lib/contracts/config";
import { publicClient } from "../../lib/chain";
import { date, kg, pricePerKg, relativeDays, shortAddress, usd } from "../../lib/format";
import { loanHealth, LotLabel } from "../lots";
import { TxStatus } from "../TxStatus";
import { Badge, Card, EmptyState, Notice, Stat } from "../ui";

/**
 * Every open advance and its health. Anyone may settle an advance that has
 * crossed the line; the keeper does it from the loss cushion if nobody does,
 * and the Safe can run the keeper by hand here. Crop the pool took in settled
 * advances can be released to the Safe to be sold.
 */
export function AdvancesTab() {
  const { stats } = usePoolStats();
  const { loans } = useLoans("all-active");
  const { lots } = useLots();
  const { byId: commodities } = useCommodities();
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const tx = useTx();
  // Released crop leaves the list, so its status lives on the card, where it stays on screen.
  const releaseTx = useTx();

  const keeper = contracts.keeper;
  const { data: upkeep } = useQuery({
    queryKey: ["upkeep", keeper],
    enabled: Boolean(keeper),
    refetchInterval: 15_000,
    queryFn: () => publicClient.readContract({ address: keeper!, abi: LiquidationKeeperAbi, functionName: "checkUpkeep", args: ["0x"] }),
  });
  const due = upkeep?.[0] === true;

  const pool = contracts.pool;
  const { data: inventory } = useQuery({
    queryKey: ["pool-inventory", pool, lots.length],
    enabled: Boolean(pool && lots.length),
    refetchInterval: 15_000,
    queryFn: async () => {
      const amounts = await Promise.all(lots.map((l) => publicClient.readContract({ address: pool!, abi: LendingPoolAbi, functionName: "inventory", args: [l.id] })));
      return lots.map((l, i) => ({ lot: l, kg: amounts[i] })).filter((x) => x.kg > 0n);
    },
  });

  async function runKeeper() {
    if (!upkeep?.[0]) return;
    try {
      await tx.send({ address: keeper!, abi: LiquidationKeeperAbi, functionName: "performUpkeep", args: [upkeep[1]] }, "Settle with the cushion");
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <div className="stack">
      <div className="grid-4" style={{ marginBottom: 0 }}>
        <Stat lead alert={due} icon={BellAlertIcon} label="Due for settlement" value={due ? "Yes" : "None"} />
        <Stat icon={DocumentTextIcon} label="Open advances" value={String(loans.length)} />
        <Stat icon={BanknotesIcon} label="Owed to the pool" value={usd(stats?.totalDebt)} />
        <Stat icon={ShieldCheckIcon} label="Loss cushion" value={usd(stats?.reserves)} />
      </div>

      <Card
        title="Open advances"
        actions={
          <button className="btn btn-danger btn-small" disabled={!due || tx.isBusy} onClick={() => void runKeeper()} data-testid="run-keeper">
            Settle due advances with the cushion
          </button>
        }
      >
        <TxStatus tx={tx} success="Settled." />
        {loans.length === 0 ? (
          <EmptyState icon={DocumentTextIcon}>No open advances.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Advance</th>
                  <th>Borrower</th>
                  <th>Security</th>
                  <th>Owed</th>
                  <th>Crop worth</th>
                  <th>Settled below</th>
                  <th>Due</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => {
                  const lot = lotById.get(loan.lotId);
                  const health = loanHealth(loan);
                  return (
                    <tr key={loan.id.toString()}>
                      <td>
                        <LotLabel lot={lot ?? { id: loan.lotId, commodityId: 0n }} commodities={commodities} sub={`Advance ${loan.id}`} />
                      </td>
                      <td>{shortAddress(loan.borrower)}</td>
                      <td>{kg(loan.collateralKg)}</td>
                      <td>{usd(loan.debt)}</td>
                      <td>{lot ? usd(lotValue(lot, commodities.get(lot.commodityId), loan.collateralKg)) : "—"}</td>
                      <td>{pricePerKg(loan.liquidationPrice)}</td>
                      <td>
                        {date(loan.maturity)} <span className="muted">({relativeDays(loan.maturity)})</span>
                      </td>
                      <td>
                        <Badge tone={health.tone}>{health.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Crop the pool took in settled advances">
        {!inventory || inventory.length === 0 ? (
          <EmptyState icon={ArchiveBoxIcon}>None. Crop the pool takes when it settles an advance waits here until it is released.</EmptyState>
        ) : (
          <div className="stack">
            {inventory.map(({ lot, kg: amount }) => (
              <ReleaseRow
                key={lot.id.toString()}
                tx={releaseTx}
                lotId={lot.id}
                label={<LotLabel lot={lot} commodities={commodities} sub={`${kg(amount)} held by the pool`} />}
                amount={amount}
              />
            ))}
          </div>
        )}
        <TxStatus tx={releaseTx} success="Released to the Safe, which can now sell it." />
        {inventory && inventory.length > 0 && (
          <Notice>Released crop goes to the Safe, which can then sell it on the market or through clearance.</Notice>
        )}
      </Card>
    </div>
  );
}

function ReleaseRow({ tx, lotId, label, amount }: { tx: Tx; lotId: bigint; label: React.ReactNode; amount: bigint }) {
  async function release() {
    try {
      await tx.send({ address: contracts.pool!, abi: LendingPoolAbi, functionName: "releaseInventory", args: [lotId, amount, VERIFIER_SAFE!] }, "Release");
    } catch {
      // Shown by TxStatus.
    }
  }
  return (
    <div className="spread" style={{ flexWrap: "wrap" }}>
      {label}
      <button className="btn btn-secondary btn-small" disabled={tx.isBusy} onClick={() => void release()}>
        Release to the Safe
      </button>
    </div>
  );
}
