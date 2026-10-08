import { useState } from "react";
import { parseUnits } from "viem";

import { useCommodities, type Commodity } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { CommodityPriceOracleAbi } from "../../lib/contracts/abis";
import { contracts, PRICE_DECIMALS, PRICE_SOURCES } from "../../lib/contracts/config";
import { date, pricePerKg } from "../../lib/format";
import { TxStatus } from "../TxStatus";
import { Badge, Card, CropSeal, Notice } from "../ui";

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
      <div className="table-scroll">
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
      </div>
    </Card>
  );
}

function PriceRow({ commodity }: { commodity: Commodity }) {
  const tx = useTx();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) return setError("Enter a price in US dollars per kg, such as 5.85.");
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
        <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
          <CropSeal name={commodity.name} size={26} />
          <strong>{commodity.name}</strong>
        </span>
      </td>
      <td className="muted">{PRICE_SOURCES[commodity.priceSource]}</td>
      <td>{pricePerKg(commodity.price)}</td>
      <td className="muted">{date(commodity.priceUpdatedAt)}</td>
      <td>{commodity.fresh ? <Badge tone="green">Current</Badge> : <Badge tone="gold">Out of date</Badge>}</td>
      <td>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input
            className="input"
            style={{ maxWidth: 110 }}
            inputMode="decimal"
            placeholder="5.85"
            aria-label={`New price for ${commodity.name} (US$ per kg)`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid={`price-${commodity.id}`}
          />
          <button className="btn btn-small" disabled={tx.isBusy} onClick={() => void save()}>
            Set price
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert" style={{ margin: "6px 0 0" }}>
            {error}
          </p>
        )}
        <TxStatus tx={tx} success="Price set." />
      </td>
    </tr>
  );
}
