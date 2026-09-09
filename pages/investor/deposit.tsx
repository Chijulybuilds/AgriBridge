import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { NetworkGuard } from "../../components/NetworkGuard";
import { TxStatus } from "../../components/TxStatus";
import {
  useDeposit,
  useInvestorPosition,
  usePoolStats,
  formatUsdc,
} from "../../hooks/useProtocol";
import { USDC_DECIMALS } from "../../lib/contracts/config";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "24px",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: "6px",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "6px",
  border: "1px solid var(--border-light)",
  background: "var(--bg-secondary)",
  fontSize: "13px",
  color: "var(--text-primary)",
  outline: "none",
};

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "11px",
    borderRadius: "6px",
    border: "none",
    background: disabled ? "var(--border)" : "var(--accent-green)",
    color: disabled ? "var(--text-muted)" : "#fff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function Deposit() {
  const pool = usePoolStats();
  const position = useInvestorPosition();
  const tx = useDeposit();

  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const parsed = (() => {
    if (!amount.trim()) return null;
    try {
      const value = parseUnits(amount, USDC_DECIMALS);
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  })();

  const walletBalance = position.usdcBalance;
  const allowance = position.allowance ?? 0n;
  const needsApproval = mode === "deposit" && parsed !== null && allowance < parsed;
  const insufficientFunds =
    mode === "deposit" && parsed !== null && walletBalance !== undefined && parsed > walletBalance;
  const insufficientShares =
    mode === "withdraw" && parsed !== null && position.shares !== undefined && parsed > position.shares;

  async function handleSubmit() {
    setFormError(null);

    if (!parsed) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (insufficientFunds) {
      setFormError("That is more than your wallet balance.");
      return;
    }
    if (insufficientShares) {
      setFormError("That is more than your position.");
      return;
    }

    try {
      if (mode === "deposit") {
        // USDC must be approved before the pool can pull it.
        if (needsApproval) {
          await tx.approve(parsed);
          await position.refetch();
          return;
        }
        await tx.deposit(parsed);
      } else {
        await tx.withdraw(parsed);
      }

      setAmount("");
      await Promise.all([position.refetch(), pool.refetch()]);
    } catch {
      // Surfaced by TxStatus through the hook's error state.
    }
  }

  const maxValue =
    mode === "deposit"
      ? walletBalance
      : position.shares;

  return (
    <DashboardLayout userType="investor">
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.3px",
            marginBottom: "4px",
          }}
        >
          Deposit &amp; Withdraw
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          Supply USDC to the lending pool and earn interest paid by farmer
          borrowers.
        </p>
      </div>

      <NetworkGuard />

      <div
        className="two-col"
        style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "24px" }}
      >
        <div style={card}>
          {/* Mode switch */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {(["deposit", "withdraw"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setAmount("");
                  setFormError(null);
                  tx.reset();
                }}
                data-testid={`mode-${m}`}
                style={{
                  flex: 1,
                  padding: "9px",
                  borderRadius: 6,
                  border: "1px solid var(--border-light)",
                  background: mode === m ? "var(--accent-green-bg)" : "var(--bg-secondary)",
                  color: mode === m ? "var(--accent-green)" : "var(--text-secondary)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {m === "deposit" ? (
                  <ArrowUpTrayIcon style={{ width: 15, height: 15 }} />
                ) : (
                  <ArrowDownTrayIcon style={{ width: 15, height: 15 }} />
                )}
                {m === "deposit" ? "Deposit" : "Withdraw"}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label}>
              {mode === "deposit" ? "Amount (USDC)" : "Shares to redeem (agUSDC)"}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              data-testid="amount-input"
              style={input}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 6,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <span>
                Available:{" "}
                {maxValue !== undefined
                  ? `${formatUsdc(maxValue)} ${mode === "deposit" ? "USDC" : "agUSDC"}`
                  : "—"}
              </span>
              {maxValue !== undefined && maxValue > 0n && (
                <button
                  onClick={() => setAmount(formatUnits(maxValue, USDC_DECIMALS))}
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
              )}
            </div>
          </div>

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
            onClick={handleSubmit}
            disabled={tx.isBusy || !parsed}
            data-testid="submit-tx"
            style={primaryButton(tx.isBusy || !parsed)}
          >
            {tx.isBusy
              ? "Processing…"
              : needsApproval
                ? "Approve USDC"
                : mode === "deposit"
                  ? "Deposit"
                  : "Withdraw"}
          </button>

          {needsApproval && !tx.isBusy && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
              Approving lets the pool move the USDC you deposit. This is a
              one-time step per amount.
            </p>
          )}

          <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
        </div>

        {/* Position + pool summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <ShieldCheckIcon style={{ width: 16, height: 16, color: "var(--accent-green)" }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Your position</span>
            </div>

            <Row label="Shares held" value={`${formatUsdc(position.shares)} agUSDC`} />
            <Row
              label="Current value"
              value={`$${formatUsdc(position.positionValue)}`}
              testId="position-value"
            />
            <Row label="Interest earned" value={`$${formatUsdc(position.earnings)}`} highlight />
            <Row label="Wallet balance" value={`${formatUsdc(position.usdcBalance)} USDC`} />
          </div>

          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <InformationCircleIcon style={{ width: 16, height: 16, color: "var(--accent-gold)" }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Pool</span>
            </div>

            <Row label="Total supplied" value={`$${formatUsdc(pool.totalAssets)}`} />
            <Row label="Total borrowed" value={`$${formatUsdc(pool.totalBorrowed)}`} />
            <Row label="Available" value={`$${formatUsdc(pool.availableLiquidity)}`} />
            <Row label="Utilisation" value={`${pool.utilisation.toFixed(1)}%`} />
            <Row
              label="Supply APR"
              value={pool.supplyApr !== undefined ? `${pool.supplyApr.toFixed(2)}%` : "—"}
              highlight
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Row({
  label: text,
  value,
  highlight,
  testId,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  testId?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "7px 0",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-secondary)" }}>{text}</span>
      <span
        data-testid={testId}
        style={{
          fontWeight: 600,
          color: highlight ? "var(--accent-green)" : "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default withAuth(Deposit, "investor");
