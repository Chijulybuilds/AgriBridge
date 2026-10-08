import { useId, useState, type ReactNode } from "react";
import { ArchiveBoxIcon, TagIcon } from "@heroicons/react/24/outline";

import { useClearanceInventory, useCommodities, useListings, useLots, useMarketSettings, type Lot } from "../../hooks/useProtocolData";
import { useTx, type Tx } from "../../hooks/useTx";
import { ERC20Abi, MarketplaceAbi } from "../../lib/contracts/abis";
import { contracts } from "../../lib/contracts/config";
import { kg, parseKg, parseUsd, percentFromBps, usd, usdPerKg } from "../../lib/format";
import { LotLabel } from "../lots";
import { TxStatus } from "../TxStatus";
import { Card, EmptyState } from "../ui";

/**
 * Expired stock. Holders sell it to AgriBridge from a fund the Safe tops up; the
 * Safe lists what it bought at a fixed price for feed buyers, and the proceeds
 * go to the treasury.
 */
export function ClearanceTab() {
  const { settings } = useMarketSettings();
  const { lots } = useLots();
  const { byId: commodities } = useCommodities();
  const { listings } = useListings();
  const { data: inventory } = useClearanceInventory(lots.map((l) => l.id));
  const held = lots.filter((l) => (inventory?.get(l.id) ?? 0n) > 0n);
  const open = listings.filter((l) => l.active && l.clearance);
  // Rows leave these lists once they are handled, so each list keeps one status that stays on screen.
  const listTx = useTx();
  const takeDownTx = useTx();

  return (
    <div className="stack">
      <FundCard balance={settings?.clearanceFund} discountBps={settings?.clearanceDiscountBps} />

      <Card title="Bought through clearance, not yet listed">
        {held.length === 0 ? (
          <EmptyState icon={ArchiveBoxIcon}>Nothing to list. Expired stock that holders sell to AgriBridge shows up here.</EmptyState>
        ) : (
          <div className="stack">
            {held.map((lot) => {
              const available = inventory!.get(lot.id)!;
              return (
                <ListClearance
                  key={lot.id.toString()}
                  tx={listTx}
                  lot={lot}
                  label={<LotLabel lot={lot} commodities={commodities} sub={`${kg(available)} bought`} />}
                  available={available}
                />
              );
            })}
          </div>
        )}
        <TxStatus tx={listTx} success="Listed. Feed buyers can see it on the market now." />
      </Card>

      <Card title="Listed for feed buyers">
        {open.length === 0 ? (
          <EmptyState icon={TagIcon}>No clearance listings.</EmptyState>
        ) : (
          <table className="table">
            <tbody>
              {open.map((listing) => (
                <ClearanceListing
                  key={listing.id.toString()}
                  tx={takeDownTx}
                  id={listing.id}
                  label={<LotLabel lot={lots.find((l) => l.id === listing.lotId) ?? { id: listing.lotId, commodityId: 0n }} commodities={commodities} />}
                  kgLeft={listing.kgRemaining}
                  price={listing.price}
                />
              ))}
            </tbody>
          </table>
        )}
        <TxStatus tx={takeDownTx} success="Taken down. The stock is back in the clearance inventory." />
      </Card>
    </div>
  );
}

function FundCard({ balance, discountBps }: { balance?: bigint; discountBps?: bigint }) {
  const id = useId();
  const tx = useTx();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function fund() {
    setError(null);
    const value = parseUsd(amount);
    if (!value) return setError("Enter an amount in US dollars, such as 5000.");
    try {
      if (tx.viaSafe) {
        // Safe transactions run in order, so the approval is queued just ahead of the top-up.
        await tx.send({ address: contracts.usdc!, abi: ERC20Abi, functionName: "approve", args: [contracts.marketplace!, value] }, "Approve");
      } else {
        await tx.ensureUsdc(contracts.marketplace!, value);
      }
      await tx.send({ address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "fundClearance", args: [value] }, "Top up the fund");
      setAmount("");
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <Card title="Clearance fund">
      <p style={{ marginBottom: 16 }}>
        <span className="stat-value" style={{ fontSize: 30 }}>
          {usd(balance)}
        </span>{" "}
        <span className="muted">available to buy expired stock at {discountBps !== undefined ? percentFromBps(discountBps) : "30%"} below its value</span>
      </p>
      <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <div className="field" style={{ marginBottom: 0, flex: "0 1 220px" }}>
          <label htmlFor={`${id}-amount`}>Top up the fund (US$)</label>
          <input id={`${id}-amount`} className="input" placeholder="5000" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button className="btn" disabled={tx.isBusy} onClick={() => void fund()}>
          Top up
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
      <TxStatus tx={tx} success="Fund topped up." />
    </Card>
  );
}

function ListClearance({ tx, lot, label, available }: { tx: Tx; lot: Lot; label: ReactNode; available: bigint }) {
  const id = useId();
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function list() {
    setError(null);
    const kgAmount = amount.trim() ? parseKg(amount) : available;
    const pricePerKg = parseUsd(price);
    if (!kgAmount || kgAmount > available) return setError(`Enter up to ${kg(available)}, or leave it empty to list all of it.`);
    if (!pricePerKg) return setError("Enter the price per kilogram in US dollars, such as 0.40.");
    try {
      await tx.send(
        { address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "listClearance", args: [lot.id, kgAmount, pricePerKg] },
        "List for feed buyers",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <div className="card-sunken">
      <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <span style={{ minWidth: 220, alignSelf: "center" }}>{label}</span>
        <div className="field" style={{ marginBottom: 0, flex: "0 1 150px" }}>
          <label htmlFor={`${id}-kg`}>Kilograms</label>
          <input id={`${id}-kg`} className="input" placeholder={`All ${kg(available)}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: "0 1 170px" }}>
          <label htmlFor={`${id}-price`}>Price (US$ per kg)</label>
          <input id={`${id}-price`} className="input" placeholder="0.40" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <button className="btn" disabled={tx.isBusy} onClick={() => void list()}>
          List for feed buyers
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function ClearanceListing({ tx, id, label, kgLeft, price }: { tx: Tx; id: bigint; label: ReactNode; kgLeft: bigint; price: bigint }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{kg(kgLeft)} left</td>
      <td>{usdPerKg(price)}</td>
      <td>
        <button
          className="btn btn-secondary btn-small"
          disabled={tx.isBusy}
          onClick={() => void tx.send({ address: contracts.marketplace!, abi: MarketplaceAbi, functionName: "cancel", args: [id] }, "Take down").catch(() => {})}
        >
          Take down
        </button>
      </td>
    </tr>
  );
}
