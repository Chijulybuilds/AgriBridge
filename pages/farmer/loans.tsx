import { useState } from "react";
import { parseUnits } from "viem";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { NetworkGuard } from "../../components/NetworkGuard";
import { TxStatus } from "../../components/TxStatus";
import {
  useBorrow,
  useInvestorPosition,
  useMyLoans,
  formatKg,
  formatUsdc,
  type Loan,
} from "../../hooks/useProtocol";
import { USDC_DECIMALS } from "../../lib/contracts/config";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "20px",
};

const LOAN_STATUS = ["Active", "Repaid", "Liquidated"] as const;

/** Health factor is 1e18-scaled; 1.0 is the liquidation threshold. */
function healthLabel(health: bigint | undefined) {
  if (health === undefined) return { text: "—", colour: "var(--text-muted)" };
  if (health >= 2n * 10n ** 18n) return { text: "Healthy", colour: "var(--accent-green)" };
  if (health >= 12n * 10n ** 17n) return { text: "Moderate", colour: "var(--accent-gold)" };
  return { text: "At risk", colour: "var(--accent-red)" };
}

function MyLoans() {
  const { loans, isLoading, refetch } = useMyLoans();
  const { allowance, refetch: refetchWallet } = useInvestorPosition();
  const tx = useBorrow();

  const [repayingId, setRepayingId] = useState<bigint | null>(null);
  const [repayAmount, setRepayAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const active = loans.filter((l) => l.status === 0);
  const totalBorrowed = loans.reduce((sum, l) => sum + l.principal, 0n);
  const totalDebt = active.reduce((sum, l) => sum + l.totalDebt, 0n);

  async function handleRepay(loan: Loan) {
    setFormError(null);

    const parsed = (() => {
      if (!repayAmount.trim()) return null;
      try {
        const v = parseUnits(repayAmount, USDC_DECIMALS);
        return v > 0n ? v : null;
      } catch {
        return null;
      }
    })();

    if (!parsed) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    // The pool rejects overpayment outright, so catch it before signing.
    if (parsed > loan.totalDebt) {
      setFormError(`That is more than the outstanding debt of $${formatUsdc(loan.totalDebt)}.`);
      return;
    }

    try {
      if ((allowance ?? 0n) < parsed) {
        await tx.approveUsdc(parsed);
        await refetchWallet();
        return;
      }

      await tx.repay(loan.id, parsed);
      setRepayAmount("");
      setRepayingId(null);
      await refetch();
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
          My Loans
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Track and repay loans taken against your tokenised commodities.
        </p>
      </div>

      <NetworkGuard />

      <div
        className="stat-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <Stat label="Total borrowed" value={`$${formatUsdc(totalBorrowed)}`} />
        <Stat label="Active loans" value={String(active.length)} />
        <Stat label="Outstanding debt" value={`$${formatUsdc(totalDebt)}`} highlight />
        <Stat label="Closed loans" value={String(loans.length - active.length)} />
      </div>

      {isLoading ? (
        <div style={card}>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading your loans…</p>
        </div>
      ) : loans.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 48 }}>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No loans yet</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Once you borrow against a verified commodity, your loans and their
            health appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {loans.map((loan) => {
            const health = healthLabel(loan.healthFactor);
            const isActive = loan.status === 0;

            return (
              <div key={loan.id.toString()} style={card} data-testid={`loan-${loan.id}`}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                      Loan #{loan.id.toString()}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Collateral: {formatKg(loan.collateralAmount)} kg
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <Metric label="Principal" value={`$${formatUsdc(loan.principal)}`} />
                    <Metric label="Debt now" value={`$${formatUsdc(loan.totalDebt)}`} />
                    <Metric
                      label="Health"
                      value={health.text}
                      colour={isActive ? health.colour : "var(--text-muted)"}
                    />
                    <Metric
                      label="Status"
                      value={LOAN_STATUS[loan.status] ?? "Unknown"}
                      colour={isActive ? "var(--accent-green)" : "var(--text-muted)"}
                    />
                  </div>
                </div>

                {isActive && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                    {repayingId === loan.id ? (
                      <>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={repayAmount}
                            onChange={(e) => setRepayAmount(e.target.value)}
                            placeholder="Amount (USDC)"
                            data-testid="repay-amount"
                            style={{
                              flex: 1,
                              minWidth: 160,
                              padding: "9px 12px",
                              borderRadius: 6,
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-secondary)",
                              fontSize: 13,
                              outline: "none",
                            }}
                          />
                          <button
                            onClick={() =>
                              setRepayAmount(
                                (Number(loan.totalDebt) / 10 ** USDC_DECIMALS).toString(),
                              )
                            }
                            style={secondaryButton}
                          >
                            Full
                          </button>
                          <button
                            onClick={() => handleRepay(loan)}
                            disabled={tx.isBusy}
                            data-testid="submit-repay"
                            style={{
                              ...secondaryButton,
                              background: "var(--accent-green)",
                              color: "#fff",
                              border: "none",
                            }}
                          >
                            {tx.isBusy
                              ? "Processing…"
                              : (allowance ?? 0n) < 1n
                                ? "Approve"
                                : "Repay"}
                          </button>
                          <button
                            onClick={() => {
                              setRepayingId(null);
                              setFormError(null);
                            }}
                            style={secondaryButton}
                          >
                            Cancel
                          </button>
                        </div>

                        {formError && (
                          <p
                            data-testid="form-error"
                            style={{ color: "#b71c1c", fontSize: 12, marginTop: 8 }}
                          >
                            {formError}
                          </p>
                        )}

                        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setRepayingId(loan.id);
                          setRepayAmount("");
                          tx.reset();
                        }}
                        data-testid="open-repay"
                        style={{
                          ...secondaryButton,
                          background: "var(--accent-green)",
                          color: "#fff",
                          border: "none",
                        }}
                      >
                        Repay loan
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

const secondaryButton: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 6,
  border: "1px solid var(--border-light)",
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: highlight ? "var(--accent-green)" : "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Metric({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: colour ?? "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

export default withAuth(MyLoans, "farmer");
