import { useState } from "react";
import { parseUnits } from "viem";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { NetworkGuard } from "../../components/NetworkGuard";
import { TxStatus } from "../../components/TxStatus";
import { formatPrice, useCommodityPrices, useHasRole, useSetPrices } from "../../hooks/useProtocol";
import { PRICE_DECIMALS, PRICE_UPDATER_ROLE, STARTING_PRICES_USD } from "../../lib/contracts/config";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "24px",
};

const button: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

/** "3 min ago" style age of an on-chain timestamp. */
function ago(timestamp?: number): string {
  if (!timestamp) return "—";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} days ago`;
}

/**
 * The verifier sets the commodity prices that value farmers' collateral. Dropping
 * them is how the demo shows a loan becoming unsafe and being liquidated.
 */
function Prices() {
  const { prices, refetch } = useCommodityPrices();
  const tx = useSetPrices();
  const { hasRole, isLoading: checkingRole } = useHasRole("priceOracle", PRICE_UPDATER_ROLE);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(updates: { index: number; price: bigint }[]) {
    setFormError(null);
    if (updates.length === 0) {
      setFormError("Enter at least one new price first.");
      return;
    }
    try {
      await tx.setPrices(updates);
      setDrafts({});
      await refetch();
    } catch {
      // Reported through TxStatus.
    }
  }

  function saveDrafts() {
    const updates: { index: number; price: bigint }[] = [];
    for (const [index, value] of Object.entries(drafts)) {
      if (!value.trim()) continue;
      let price: bigint;
      try {
        price = parseUnits(value.trim(), PRICE_DECIMALS);
      } catch {
        setFormError(`"${value}" is not a valid price.`);
        return;
      }
      if (price <= 0n) {
        setFormError("Prices must be above zero.");
        return;
      }
      updates.push({ index: Number(index), price });
    }
    void submit(updates);
  }

  /** Halve every price: enough to push a loan near the 70% limit under water. */
  function crash() {
    void submit(
      prices.flatMap((p) => (p.price !== undefined ? [{ index: p.index, price: p.price / 2n }] : [])),
    );
  }

  function reset() {
    void submit(STARTING_PRICES_USD.map((usd, index) => ({ index, price: parseUnits(String(usd), PRICE_DECIMALS) })));
  }

  return (
    <DashboardLayout userType="admin">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: 4 }}>
          Commodity Prices
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          These prices value every farmer&apos;s collateral. Lower them to show how a price drop puts loans at risk.
        </p>
      </div>

      <NetworkGuard />
      {!checkingRole && !hasRole && (
        <p role="alert" style={{ color: "var(--accent-red)", fontSize: 13, marginBottom: 16 }}>
          This wallet cannot set prices: it needs PRICE_UPDATER_ROLE on the price oracle.
        </p>
      )}

      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }} data-testid="price-table">
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 12 }}>
                <th style={{ padding: "8px 6px" }}>Commodity</th>
                <th style={{ padding: "8px 6px" }}>Price (USD/kg)</th>
                <th style={{ padding: "8px 6px" }}>Updated</th>
                <th style={{ padding: "8px 6px" }}>Status</th>
                <th style={{ padding: "8px 6px" }}>New price</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr key={p.name} style={{ borderTop: "1px solid var(--border)" }} data-testid={`price-row-${p.name}`}>
                  <td style={{ padding: "10px 6px", fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: "10px 6px" }} data-testid={`price-${p.name}`}>${formatPrice(p.price)}</td>
                  <td style={{ padding: "10px 6px", color: "var(--text-muted)" }}>{ago(p.updatedAt)}</td>
                  <td style={{ padding: "10px 6px" }}>
                    {p.fresh === undefined ? (
                      "—"
                    ) : (
                      <span style={{ color: p.fresh ? "var(--accent-green)" : "var(--accent-red)", fontWeight: 600 }}>
                        {p.fresh ? "Fresh" : "Stale"}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 6px" }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={formatPrice(p.price)}
                      value={drafts[p.index] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.index]: e.target.value }))}
                      style={{
                        width: 110,
                        padding: "7px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-secondary)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {formError && (
          <p style={{ color: "var(--accent-red)", fontSize: 13, marginTop: 12 }}>{formError}</p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
          <button
            onClick={saveDrafts}
            disabled={tx.isBusy}
            style={{ ...button, background: "var(--accent-green)", color: "#fff", border: "none" }}
          >
            Save new prices
          </button>
          <button onClick={crash} disabled={tx.isBusy} style={{ ...button, color: "var(--accent-red)" }} data-testid="price-crash">
            Simulate price crash (−50%)
          </button>
          <button onClick={reset} disabled={tx.isBusy} style={button} data-testid="price-reset">
            Reset to starting prices
          </button>
        </div>

        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />

        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 16, lineHeight: 1.6 }}>
          A loan becomes liquidatable when its collateral is worth less than its debt (health factor below
          1.00). After a crash, open <strong>Loans &amp; Liquidation</strong> to see which loans are at risk.
        </p>
      </div>
    </DashboardLayout>
  );
}

export default withAuth(Prices, "admin");
