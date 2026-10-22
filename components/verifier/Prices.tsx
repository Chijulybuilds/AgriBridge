import { useState } from "react";
import { parseUnits } from "viem";

import { useCommodities, useOracleStatus, type Commodity, type OracleStatus } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { CommodityPriceOracleAbi } from "../../lib/contracts/abis";
import { BPS, contracts, PRICE_DECIMALS, PRICE_SOURCES } from "../../lib/contracts/config";
import { date, dateTime, percentFromBps, pricePerKg } from "../../lib/format";
import { TxStatus } from "../TxStatus";
import { Badge, Card, CropSeal, Notice } from "../ui";

/**
 * Prices. A world price goes through the oracle's move cap: a change bigger than
 * the cap is held until the Safe sets it again after the confirmation delay, so
 * one wrong number never reaches a loan. Local prices come from the approved
 * reporters. Overriding a price directly is the emergency path: the Safe pauses
 * prices first (nothing borrows or is settled while they are paused), overrides,
 * then resumes. In production Chainlink and the reporters post prices; the
 * festival demo runs no live feed, so the Safe sets world prices here.
 */
export function PricesTab() {
  const { commodities } = useCommodities();
  const { status } = useOracleStatus();
  return (
    <Card title="Prices (US$ per kg, Grade A, before the basis cut)">
      <Brake status={status} />
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Crop</th>
              <th>Source</th>
              <th>Price</th>
              <th>Set</th>
              <th>Status</th>
              <th>{status?.paused ? "Override" : "New price"}</th>
            </tr>
          </thead>
          <tbody>
            {commodities.map((c) => (
              <PriceRow key={c.id.toString()} commodity={c} status={status} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** The emergency brake: pausing prices stops every valuation, and unlocks the override. */
function Brake({ status }: { status?: OracleStatus }) {
  const tx = useTx();
  const paused = status?.paused === true;
  // After an override, prices stay paused for the cooling-off, so borrowers can react first.
  const coolingOff = paused && status !== undefined && status.chainNow < status.resumableAt;
  const cap = status ? percentFromBps(status.maxMoveBps) : "10%";
  const wait = status ? minutes(status.confirmationDelay) : "10 minutes";

  async function toggle() {
    try {
      await tx.send(
        { address: contracts.oracle!, abi: CommodityPriceOracleAbi, functionName: paused ? "unpause" : "pause" },
        paused ? "Resume prices" : "Pause prices",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {paused ? (
        <Notice tone="danger" testId="prices-paused">
          <strong>Prices are paused.</strong> Until you resume them, nothing can borrow or be settled, and listings priced
          against the market can&apos;t be bought. Repayments still work. While prices are paused you can override any price
          directly.
        </Notice>
      ) : (
        <Notice>
          A world price moves by at most {cap} at a time. A bigger change is held until you set it again at least {wait} later,
          so one wrong number never reaches an advance. Local prices come from the approved reporters. To override a price in an
          emergency, pause prices first.
        </Notice>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className={`btn btn-small${paused ? "" : " btn-danger"}`}
          disabled={tx.isBusy || !status || coolingOff}
          onClick={() => void toggle()}
          data-testid="price-brake"
        >
          {paused ? "Resume prices" : "Pause prices"}
        </button>
        {coolingOff && (
          <span className="muted">
            Prices can resume from {dateTime(status.resumableAt)}, an hour after the last override, so borrowers see the new price
            and can repay first.
          </span>
        )}
      </div>
      <TxStatus tx={tx} success={tx.step === "Pause prices" ? "Prices paused." : "Prices resumed."} />
    </div>
  );
}

type Action = "set" | "confirm" | "override";

function PriceRow({ commodity, status }: { commodity: Commodity; status?: OracleStatus }) {
  const tx = useTx();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string>();

  const paused = status?.paused === true;
  const local = commodity.priceSource === 1;
  const hasPrice = commodity.priceUpdatedAt !== undefined && commodity.priceUpdatedAt > 0n;
  const held = commodity.heldPrice;
  const confirmFrom = held && status ? Number(commodity.heldSince ?? 0n) + status.confirmationDelay : undefined;
  const canConfirm = confirmFrom !== undefined && status !== undefined && status.chainNow >= confirmFrom;
  // Without a price yet, or with prices paused, the Safe sets it directly; a world price otherwise goes through the cap.
  const direct = paused || !hasPrice;

  async function send(price: bigint, action: Action) {
    const verb = action === "confirm" ? "Confirm" : action === "override" ? "Override" : "Set";
    setSuccess(
      action === "confirm"
        ? "Price confirmed."
        : action === "override"
          ? hasPrice
            ? "Price overridden."
            : "First price set."
          : willBeHeld(price, commodity, status, canConfirm)
            ? `Held: that is more than ${percentFromBps(status?.maxMoveBps ?? 1_000)} from the current price, so it waits for you to confirm it.`
            : "Price set.",
    );
    try {
      await tx.send(
        {
          address: contracts.oracle!,
          abi: CommodityPriceOracleAbi,
          functionName: action === "override" ? "forcePrice" : "setPrice",
          args: [commodity.id, price],
        },
        `${verb} ${commodity.name}`,
      );
      setValue("");
    } catch {
      // Shown by TxStatus.
    }
  }

  function submit() {
    setError(null);
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) return setError("Enter a price in US dollars per kg, such as 5.85.");
    void send(parseUnits(trimmed, PRICE_DECIMALS), direct ? "override" : "set");
  }

  // A locally priced crop with a price takes new ones only from its reporters, unless prices are paused.
  const fromReporters = local && !direct;

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
      <td>
        {paused ? (
          <Badge tone="red">Paused</Badge>
        ) : commodity.fresh ? (
          <Badge tone="green">Current</Badge>
        ) : (
          <Badge tone="gold">Out of date</Badge>
        )}
      </td>
      <td>
        {fromReporters ? (
          <p className="muted" style={{ margin: 0, maxWidth: 260 }} data-testid={`price-${commodity.id}-reporters`}>
            {status && status.reporterCount >= status.localQuorum
              ? `Set when ${status.localQuorum} of the ${status.reporterCount} reporters agree.`
              : "No reporters yet. To change it, pause prices and override it."}
          </p>
        ) : (
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
            <button className="btn btn-small" disabled={tx.isBusy || !status} onClick={submit}>
              {direct ? (hasPrice ? "Override" : "Set first price") : "Set price"}
            </button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert" style={{ margin: "6px 0 0" }}>
            {error}
          </p>
        )}
        {held && !paused && (
          <div className="row" style={{ marginTop: 8, gap: 8 }} data-testid={`held-${commodity.id}`}>
            <Badge tone="gold">Held</Badge>
            <span className="muted">
              {pricePerKg(held)} since {dateTime(commodity.heldSince)}.{" "}
              {local
                ? "It applies once the reporters agree on it again."
                : canConfirm
                  ? null
                  : `You can confirm it from ${dateTime(confirmFrom)}.`}
            </span>
            {!local && canConfirm && (
              <button
                className="btn btn-small btn-secondary"
                disabled={tx.isBusy}
                onClick={() => void send(held, "confirm")}
                data-testid={`confirm-${commodity.id}`}
              >
                Confirm {pricePerKg(held)}
              </button>
            )}
          </div>
        )}
        <TxStatus tx={tx} success={success} />
      </td>
    </tr>
  );
}

/** Mirrors the oracle's move cap: whether setting `price` would be held rather than applied. */
function willBeHeld(price: bigint, commodity: Commodity, status: OracleStatus | undefined, canConfirm: boolean): boolean {
  if (!status || commodity.price === undefined || !commodity.priceUpdatedAt) return false;
  const cap = BigInt(status.maxMoveBps);
  if (within(price, commodity.price, cap)) return false;
  return !(canConfirm && commodity.heldPrice !== undefined && within(price, commodity.heldPrice, cap));
}

function within(value: bigint, reference: bigint, bps: bigint): boolean {
  const diff = value > reference ? value - reference : reference - value;
  return diff * BPS <= reference * bps;
}

function minutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}
