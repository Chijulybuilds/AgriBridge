import { useState, type ReactNode } from "react";
import { ArchiveBoxIcon, TagIcon } from "@heroicons/react/24/outline";

import { useClearanceInventory, useCommodities, useListings, useLots, useMarketSettings, type Lot } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
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
                  lot={lot}
                  label={<LotLabel lot={lot} commodities={commodities} sub={`${kg(available)} bought`} />}
                  available={available}
                />
              );
            })}
          </div>
        )}
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
                  id={listing.id}
                  label={<LotLabel lot={lots.find((l) => l.id === listing.lotId) ?? { id: listing.lotId, commodityId: 0n }} commodities={commodities} />}
                  kgLeft={listing.kgRemaining}
                  price={listing.price}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function FundCard({ balance, discountBps }: { balance?: bigint; discountBps?: bigint }) {
  const tx = useTx();
  const [amount, setAmount] = useState("");

  async function fund() {
    const value = parseUsd(amount);
    if (!value) return;
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
      <p style={{ marginBottom: 12 }}>
        <strong style={{ fontSize: 20 }}>{usd(balance)}</strong>{" "}
        <span className="muted">available to buy expired stock at {discountBps !== undefined ? percentFromBps(discountBps) : "30%"} below its value</span>
      </p>
      <div className="row">
        <input className="input" style={{ maxWidth: 200 }} placeholder="Top up (US$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" disabled={tx.isBusy || !parseUsd(amount)} onClick={() => void fund()}>
          Top up
        </button>
      </div>
      <TxStatus tx={tx} success="Fund topped up." />
    </Card>
  );
}

function ListClearance({ lot, label, available }: { lot: Lot; label: ReactNode; available: bigint }) {
  const tx = useTx();
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");

  async function list() {
    const kgAmount = parseKg(amount) ?? available;
    const pricePerKg = parseUsd(price);
    if (!pricePerKg || kgAmount > available) return;
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
      <div className="row">
        <span style={{ minWidth: 220 }}>{label}</span>
        <input className="input" style={{ maxWidth: 140 }} placeholder={`kg (all ${kg(available)})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="input" style={{ maxWidth: 140 }} placeholder="US$ per kg" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button className="btn btn-small" disabled={tx.isBusy || !parseUsd(price)} onClick={() => void list()}>
          List
        </button>
      </div>
      <TxStatus tx={tx} success="Listed." />
    </div>
  );
}

function ClearanceListing({ id, label, kgLeft, price }: { id: bigint; label: ReactNode; kgLeft: bigint; price: bigint }) {
  const tx = useTx();
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
        <TxStatus tx={tx} success="Taken down; the stock is back in the clearance inventory." />
      </td>
    </tr>
  );
}
