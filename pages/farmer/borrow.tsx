import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { BanknotesIcon, InformationCircleIcon } from "@heroicons/react/24/outline";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { NetworkGuard } from "../../components/NetworkGuard";
import { TxStatus } from "../../components/TxStatus";
import {
  useBorrow,
  useCollateralApproval,
  useCollateralValue,
  useMyCommodities,
  usePoolStats,
  formatKg,
  formatUsdc,
} from "../../hooks/useProtocol";
import { MAX_LTV, USDC_DECIMALS } from "../../lib/contracts/config";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "24px",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 6,
  border: "1px solid var(--border-light)",
  background: "var(--bg-secondary)",
  fontSize: 13,
  color: "var(--text-primary)",
  outline: "none",
};

/** The pool enforces a $100 floor on any loan. */
const MIN_BORROW_USDC = 100;

function BorrowFunds() {
  const { commodities, isLoading } = useMyCommodities();
  const pool = usePoolStats();
  const tx = useBorrow();
  const { isApproved, refetch: refetchApproval } = useCollateralApproval();

  const [selectedId, setSelectedId] = useState<string>("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Only verified commodities carry minted collateral tokens.
  const eligible = useMemo(
    () => commodities.filter((c) => c.status === "Verified"),
    [commodities],
  );

  const selected = eligible.find((c) => c.id.toString() === selectedId);

  const { value: collateralValue } = useCollateralValue(selected?.id, selected?.quantity);

  const maxBorrow =
    collateralValue !== undefined
      ? (collateralValue * BigInt(Math.round(MAX_LTV * 10_000))) / 10_000n
      : undefined;

  const parsedBorrow = (() => {
    if (!borrowAmount.trim()) return null;
    try {
      const value = parseUnits(borrowAmount, USDC_DECIMALS);
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  })();

  const ltv =
    parsedBorrow !== null && collateralValue !== undefined && collateralValue > 0n
      ? Number((parsedBorrow * 10_000n) / collateralValue) / 100
      : 0;

  async function handleBorrow() {
    setFormError(null);

    if (!selected) {
      setFormError("Select a verified commodity to use as collateral.");
      return;
    }
    if (!parsedBorrow) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (parsedBorrow < parseUnits(String(MIN_BORROW_USDC), USDC_DECIMALS)) {
      setFormError(`The minimum loan is $${MIN_BORROW_USDC}.`);
      return;
    }
    if (maxBorrow !== undefined && parsedBorrow > maxBorrow) {
      setFormError(
        `That exceeds the 70% limit. You can borrow up to $${formatUsdc(maxBorrow)}.`,
      );
      return;
    }
    if (pool.availableLiquidity !== undefined && parsedBorrow > pool.availableLiquidity) {
      setFormError("The pool does not have enough liquidity for that amount right now.");
      return;
    }

    try {
      // The pool takes custody of the ERC-1155, so it needs operator approval once.
      if (!isApproved) {
        await tx.approveCollateral();
        await refetchApproval();
        return;
      }

      await tx.borrow(selected.id, selected.quantity, parsedBorrow);
      setBorrowAmount("");
      await pool.refetch();
    } catch {
      // Reported through TxStatus.
    }
  }

  return (
    <DashboardLayout userType="farmer">
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.3px",
            marginBottom: 4,
          }}
        >
          Borrow Funds
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Lock a verified commodity as collateral and borrow USDC against it.
        </p>
      </div>

      <NetworkGuard />

      <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: "var(--accent-green-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BanknotesIcon style={{ width: 16, height: 16, color: "var(--accent-green)" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>New loan</span>
          </div>

          {isLoading ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading your commodities…</p>
          ) : eligible.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
              You have no verified commodities yet. Tokenise a harvest and wait
              for a verifier to approve it before borrowing.
            </p>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Collateral</label>
                <select
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setBorrowAmount("");
                    setFormError(null);
                  }}
                  data-testid="collateral-select"
                  style={field}
                >
                  <option value="">Choose a verified commodity</option>
                  {eligible.map((c) => (
                    <option key={c.id.toString()} value={c.id.toString()}>
                      #{c.id.toString()} — {c.commodityType}, Grade {c.grade},{" "}
                      {formatKg(c.quantity)} kg
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={label}>Amount to borrow (USDC)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={borrowAmount}
                  onChange={(e) => setBorrowAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={!selected}
                  data-testid="borrow-amount"
                  style={field}
                />
                {maxBorrow !== undefined && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 6,
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>Max at 70% LTV: ${formatUsdc(maxBorrow)}</span>
                    <button
                      onClick={() => setBorrowAmount(formatUnits(maxBorrow, USDC_DECIMALS))}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-green)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Max
                    </button>
                  </div>
                )}
              </div>

              {parsedBorrow !== null && collateralValue !== undefined && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 6,
                    marginBottom: 16,
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <Row label="Collateral value" value={`$${formatUsdc(collateralValue)}`} />
                  <Row
                    label="Loan-to-value"
                    value={`${ltv.toFixed(1)}%`}
                    danger={ltv > MAX_LTV * 100}
                  />
                  <Row
                    label="Borrow APR"
                    value={pool.borrowApr !== undefined ? `${pool.borrowApr.toFixed(2)}%` : "—"}
                  />
                </div>
              )}

              {formError && (
                <p
                  data-testid="form-error"
                  style={{
                    background: "#fdecea",
                    color: "#b71c1c",
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  {formError}
                </p>
              )}

              <button
                onClick={handleBorrow}
                disabled={tx.isBusy || !selected}
                data-testid="submit-borrow"
                style={{
                  width: "100%",
                  padding: 11,
                  borderRadius: 6,
                  border: "none",
                  background: tx.isBusy || !selected ? "var(--border)" : "var(--accent-green)",
                  color: tx.isBusy || !selected ? "var(--text-muted)" : "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: tx.isBusy || !selected ? "not-allowed" : "pointer",
                }}
              >
                {tx.isBusy
                  ? "Processing…"
                  : !isApproved
                    ? "Approve collateral"
                    : "Borrow"}
              </button>

              {!isApproved && selected && !tx.isBusy && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                  The pool needs permission to hold your commodity tokens while
                  the loan is open. This is a one-time approval.
                </p>
              )}

              <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
            </>
          )}
        </div>

        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <InformationCircleIcon style={{ width: 16, height: 16, color: "var(--accent-gold)" }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>How borrowing works</span>
          </div>

          <ol
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.7,
              paddingLeft: 18,
              margin: 0,
            }}
          >
            <li>Your commodity is priced by the oracle at its current market rate.</li>
            <li>You may borrow up to 70% of that value.</li>
            <li>Your commodity tokens are held by the pool until you repay.</li>
            <li>Interest accrues continuously at the pool&apos;s borrow rate.</li>
            <li>If your health factor falls below 1.0, the loan can be liquidated.</li>
          </ol>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <Row label="Pool liquidity" value={`$${formatUsdc(pool.availableLiquidity)}`} />
            <Row label="Minimum loan" value={`$${MIN_BORROW_USDC}`} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Row({ label: text, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
      <span style={{ color: "var(--text-secondary)" }}>{text}</span>
      <span style={{ fontWeight: 600, color: danger ? "var(--accent-red)" : "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

export default withAuth(BorrowFunds, "farmer");
