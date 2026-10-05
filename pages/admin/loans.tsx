import { useState } from "react";
import Link from "next/link";
import { maxUint256 } from "viem";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { NetworkGuard } from "../../components/NetworkGuard";
import { TxStatus } from "../../components/TxStatus";
import {
  formatKg,
  formatUsdc,
  useAllLoans,
  useHasRole,
  useInvestorPosition,
  useLiquidate,
  type PoolLoan,
} from "../../hooks/useProtocol";
import { LIQUIDATOR_ROLE } from "../../lib/contracts/config";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "24px",
};

const LOAN_STATUS = ["Active", "Repaid", "Liquidated"] as const;
const ONE = 10n ** 18n;

function healthLabel(loan: PoolLoan): { text: string; colour: string } {
  if (loan.status !== 0 || loan.healthFactor === undefined) return { text: "—", colour: "var(--text-muted)" };
  if (loan.healthFactor === maxUint256) return { text: "∞", colour: "var(--accent-green)" };
  const value = Number((loan.healthFactor * 100n) / ONE) / 100;
  const colour = value < 1 ? "var(--accent-red)" : value < 1.2 ? "var(--accent-gold)" : "var(--accent-green)";
  return { text: value.toFixed(2), colour };
}

/**
 * Every loan in the pool. A loan whose collateral is now worth less than its debt
 * (health factor below 1.00) can be liquidated: the liquidator pays the debt and
 * takes the commodity tokens.
 */
function Loans() {
  const { loans, refetch } = useAllLoans();
  const tx = useLiquidate();
  const wallet = useInvestorPosition(); // the connected wallet's USDC balance and pool allowance
  const { hasRole, isLoading: checkingRole } = useHasRole("lendingPool", LIQUIDATOR_ROLE);
  const [busyId, setBusyId] = useState<bigint | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function liquidate(loan: PoolLoan) {
    setFormError(null);
    if (wallet.usdcBalance !== undefined && wallet.usdcBalance < loan.totalDebt) {
      setFormError(`Liquidating loan #${loan.id} costs $${formatUsdc(loan.totalDebt)}. Get test USDC first.`);
      return;
    }
    setBusyId(loan.id);
    try {
      // The debt keeps growing until the transaction lands, so approve a 1% margin.
      const needed = (loan.totalDebt * 101n) / 100n;
      if ((wallet.allowance ?? 0n) < needed) {
        await tx.approveUsdc(needed);
        await wallet.refetch();
      }
      await tx.liquidate(loan.id);
      await refetch();
    } catch {
      // Reported through TxStatus.
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardLayout userType="admin">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: 4 }}>
          Loans &amp; Liquidation
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Every loan in the pool. When a loan&apos;s collateral is worth less than its debt (health below 1.00), it
          can be liquidated: you pay the debt and receive the commodity tokens.
        </p>
      </div>

      <NetworkGuard />
      {!checkingRole && !hasRole && (
        <p role="alert" style={{ color: "var(--accent-red)", fontSize: 13, marginBottom: 16 }}>
          This wallet cannot liquidate: it needs LIQUIDATOR_ROLE on the lending pool.
        </p>
      )}

      <div style={card}>
        {loans.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }} data-testid="no-loans">
            No loans yet. When a farmer borrows, the loan shows up here.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }} data-testid="loan-table">
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 12 }}>
                  <th style={{ padding: "8px 6px" }}>Loan</th>
                  <th style={{ padding: "8px 6px" }}>Farmer</th>
                  <th style={{ padding: "8px 6px" }}>Collateral</th>
                  <th style={{ padding: "8px 6px" }}>Debt</th>
                  <th style={{ padding: "8px 6px" }}>Health</th>
                  <th style={{ padding: "8px 6px" }}>Status</th>
                  <th style={{ padding: "8px 6px" }} />
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => {
                  const health = healthLabel(loan);
                  const liquidatable =
                    loan.status === 0 && loan.healthFactor !== undefined && loan.healthFactor < ONE;
                  return (
                    <tr key={loan.id.toString()} style={{ borderTop: "1px solid var(--border)" }} data-testid={`loan-row-${loan.id}`}>
                      <td style={{ padding: "10px 6px", fontWeight: 600 }}>#{loan.id.toString()}</td>
                      <td style={{ padding: "10px 6px", fontFamily: "monospace", fontSize: 12 }}>
                        {loan.farmer.slice(0, 6)}…{loan.farmer.slice(-4)}
                      </td>
                      <td style={{ padding: "10px 6px" }}>
                        {formatKg(loan.collateralAmount)} kg
                        {loan.commodityId !== undefined && (
                          <span style={{ color: "var(--text-muted)" }}> (lot #{loan.commodityId.toString()})</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 6px" }}>{loan.status === 0 ? `$${formatUsdc(loan.totalDebt)}` : "—"}</td>
                      <td style={{ padding: "10px 6px", fontWeight: 700, color: health.colour }} data-testid={`loan-health-${loan.id}`}>
                        {health.text}
                      </td>
                      <td style={{ padding: "10px 6px" }} data-testid={`loan-status-${loan.id}`}>
                        {LOAN_STATUS[loan.status] ?? "Unknown"}
                      </td>
                      <td style={{ padding: "10px 6px", textAlign: "right" }}>
                        {liquidatable && (
                          <button
                            onClick={() => liquidate(loan)}
                            disabled={tx.isBusy}
                            data-testid={`liquidate-${loan.id}`}
                            style={{
                              padding: "7px 12px",
                              borderRadius: 6,
                              border: "none",
                              background: "var(--accent-red)",
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: tx.isBusy ? "not-allowed" : "pointer",
                            }}
                          >
                            {busyId === loan.id ? "Liquidating…" : "Liquidate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {formError && <p style={{ color: "var(--accent-red)", fontSize: 13, marginTop: 12 }}>{formError}</p>}
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />

        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 16, lineHeight: 1.6 }}>
          To demonstrate a liquidation, open <Link href="/admin/prices">Prices</Link> and simulate a price crash,
          then come back here.
        </p>
      </div>
    </DashboardLayout>
  );
}

export default withAuth(Loans, "admin");
