import { ArrowTrendingUpIcon } from "@heroicons/react/24/outline";

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

function Returns() {
  const pool = usePoolStats();
  const position = useInvestorPosition();

  const principal = position.shares;
  const value = position.positionValue;
  const earned = position.earnings;

  const growthPct =
    principal !== undefined && principal > 0n && earned !== undefined
      ? Number((earned * 10_000n) / principal) / 100
      : 0;

  // Projected forward from the live supply rate, not from stored history:
  // the protocol keeps no off-chain earnings series.
  const projectedAnnual =
    value !== undefined && pool.supplyApr !== undefined
      ? (Number(formatUsdc(value).replace(/,/g, "")) * pool.supplyApr) / 100
      : undefined;

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
          Returns
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Interest accrues continuously into the value of your agUSDC shares.
        </p>
      </div>

      <NetworkGuard />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Stat label="Shares held" value={`${formatUsdc(principal)} agUSDC`} />
        <Stat label="Current value" value={`$${formatUsdc(value)}`} />
        <Stat label="Interest earned" value={`$${formatUsdc(earned)}`} highlight />
        <Stat label="Growth" value={`${growthPct.toFixed(2)}%`} highlight />
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <ArrowTrendingUpIcon style={{ width: 16, height: 16, color: "var(--accent-green)" }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Projection</span>
        </div>

        {position.shares === undefined || position.shares === 0n ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
            You have no position yet. Once you deposit USDC, your shares begin
            accruing interest immediately and your returns appear here.
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <Row
                label="Current supply APR"
                value={pool.supplyApr !== undefined ? `${pool.supplyApr.toFixed(2)}%` : "—"}
              />
              <Row
                label="Projected annual interest"
                value={
                  projectedAnnual !== undefined
                    ? `$${projectedAnnual.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : "—"
                }
              />
              <Row label="Pool utilisation" value={`${pool.utilisation.toFixed(1)}%`} />
            </div>

            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              The projection extrapolates the current rate. The actual rate moves
              with pool utilisation, so returns rise when borrowing demand rises
              and fall when it drops.
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, fontWeight: 600 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: "-0.5px",
          color: highlight ? "var(--accent-green)" : "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default withAuth(Returns, "investor");
