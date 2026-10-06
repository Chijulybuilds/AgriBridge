import { useState } from "react";
import { parseUnits } from "viem";

import { useCommodities, type Commodity } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { CommodityPriceOracleAbi } from "../../lib/contracts/abis";
import { contracts, PRICE_DECIMALS, PRICE_SOURCES } from "../../lib/contracts/config";
import { date, pricePerKg } from "../../lib/format";
import { TxStatus } from "../TxStatus";
import { Badge, Card, Notice } from "../ui";

/**
 * Set prices. The festival demo runs no live price feed: prices are set at
 * deployment and changed here by the Safe, for example to show what a price
 * crash does to advances. In production, Chainlink and the local reporters post
 * prices, and this override is for emergencies.
 */
export function PricesTab() {
  const { commodities } = useCommodities();
  return (
    <Card title="Prices (US$ per kg, Grade A, before the basis cut)">
      <Notice>Prices here are set by the Safe. Advances and the market use them straight away.</Notice>
      <table className="table">
        <thead>
          <tr>
            <th>Crop</th>
            <th>Source</th>
            <th>Price</th>
            <th>Set</th>
            <th>Status</th>
            <th>New price</th>
          </tr>
        </thead>
        <tbody>
          {commodities.map((c) => (
            <PriceRow key={c.id.toString()} commodity={c} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PriceRow({ commodity }: { commodity: Commodity }) {
  const tx = useTx();
  const [value, setValue] = useState("");

  async function save() {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) return;
    try {
      await tx.send(
        {
          address: contracts.oracle!,
          abi: CommodityPriceOracleAbi,
          functionName: "forcePrice",
          args: [commodity.id, parseUnits(trimmed, PRICE_DECIMALS)],
        },
        `Set ${commodity.name}`,
      );
      setValue("");
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <tr>
      <td>
        <strong>{commodity.name}</strong>
      </td>
      <td className="muted">{PRICE_SOURCES[commodity.priceSource]}</td>
      <td>{pricePerKg(commodity.price)}</td>
      <td className="muted">{date(commodity.priceUpdatedAt)}</td>
      <td>{commodity.fresh ? <Badge tone="green">Current</Badge> : <Badge tone="gold">Out of date</Badge>}</td>
      <td>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" style={{ maxWidth: 110 }} inputMode="decimal" placeholder="5.85" value={value} onChange={(e) => setValue(e.target.value)} data-testid={`price-${commodity.id}`} />
          <button className="btn btn-small" disabled={tx.isBusy || !value.trim()} onClick={() => void save()}>
            Set
          </button>
        </div>
        <TxStatus tx={tx} success="Price set." />
      </td>
    </tr>
  );
}
