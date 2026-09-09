import Link from "next/link";
import { BuildingLibraryIcon } from "@heroicons/react/24/outline";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { NetworkGuard } from "../../components/NetworkGuard";
import { useInvestorPosition, usePoolStats, formatUsdc } from "../../hooks/useProtocol";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "24px",
};

function Pools() {
  const pool = usePoolStats();
  const position = useInvestorPosition();

  return (
    <DashboardLayout userType="investor">
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
          Liquidity Pool
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          AgriBridge runs a single USDC pool. Farmers borrow against verified
          commodity collateral, and interest flows back to suppliers.
        </p>
      </div>

      <NetworkGuard />

      <div style={card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: "var(--accent-green-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BuildingLibraryIcon style={{ width: 20, height: 20, color: "var(--accent-green)" }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>USDC Lending Pool</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Collateral: tokenised commodities (ERC-1155)
              </div>
            </div>
          </div>

          <Link
            href="/investor/deposit"
            style={{
              padding: "9px 18px",
              borderRadius: 6,
              background: "var(--accent-green)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Deposit
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 16,
            paddingTop: 20,
            borderTop: "1px solid var(--border)",
          }}
        >
          <Metric
            label="Supply APR"
            value={pool.supplyApr !== undefined ? `${pool.supplyApr.toFixed(2)}%` : "—"}
            highlight
          />
          <Metric
            label="Borrow APR"
            value={pool.borrowApr !== undefined ? `${pool.borrowApr.toFixed(2)}%` : "—"}
          />
          <Metric label="Total supplied" value={`$${formatUsdc(pool.totalAssets)}`} />
          <Metric label="Total borrowed" value={`$${formatUsdc(pool.totalBorrowed)}`} />
          <Metric label="Available" value={`$${formatUsdc(pool.availableLiquidity)}`} />
          <Metric label="Utilisation" value={`${pool.utilisation.toFixed(1)}%`} />
          <Metric label="Your position" value={`$${formatUsdc(position.positionValue)}`} highlight />
        </div>

        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginTop: 20,
            lineHeight: 1.6,
          }}
        >
          Rates follow a kink-based model: they rise gently up to 80% utilisation
          and steeply beyond it, so liquidity stays available for withdrawals.
          Loans are capped at 70% loan-to-value against oracle-priced collateral.
        </p>
      </div>
    </DashboardLayout>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: highlight ? "var(--accent-green)" : "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default withAuth(Pools, "investor");
