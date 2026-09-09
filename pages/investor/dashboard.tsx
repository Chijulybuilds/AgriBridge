import Link from "next/link";
import {
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ChartPieIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { NetworkGuard } from "../../components/NetworkGuard";
import { useInvestorPosition, usePoolStats, formatUsdc } from "../../hooks/useProtocol";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "20px",
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  testId,
}: {
  icon: typeof BanknotesIcon;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  testId?: string;
}) {
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            background: "var(--accent-green-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon style={{ width: 15, height: 15, color: accent ?? "var(--accent-green)" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          {label}
        </span>
      </div>
      <div
        data-testid={testId}
        style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px" }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function InvestorDashboard() {
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
          Investor Dashboard
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Your position in the AgriBridge lending pool, read live from the chain.
        </p>
      </div>

      <NetworkGuard />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatCard
          icon={WalletIcon}
          label="Position value"
          value={`$${formatUsdc(position.positionValue)}`}
          sub={`${formatUsdc(position.shares)} agUSDC`}
          testId="stat-position"
        />
        <StatCard
          icon={ArrowTrendingUpIcon}
          label="Interest earned"
          value={`$${formatUsdc(position.earnings)}`}
          sub="Accrued since deposit"
        />
        <StatCard
          icon={BanknotesIcon}
          label="Supply APR"
          value={pool.supplyApr !== undefined ? `${pool.supplyApr.toFixed(2)}%` : "—"}
          sub={`Borrow APR ${pool.borrowApr !== undefined ? `${pool.borrowApr.toFixed(2)}%` : "—"}`}
          accent="var(--accent-gold)"
        />
        <StatCard
          icon={ChartPieIcon}
          label="Pool utilisation"
          value={`${pool.utilisation.toFixed(1)}%`}
          sub={`$${formatUsdc(pool.availableLiquidity)} available`}
          accent="var(--accent-blue)"
        />
      </div>

      <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
        <div style={card}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Pool overview</h2>

          <Bar
            label="Borrowed"
            value={pool.totalBorrowed}
            total={pool.totalAssets}
            colour="var(--accent-green)"
          />

          <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
            <Row label="Total supplied" value={`$${formatUsdc(pool.totalAssets)}`} />
            <Row label="Total borrowed" value={`$${formatUsdc(pool.totalBorrowed)}`} />
            <Row label="Available liquidity" value={`$${formatUsdc(pool.availableLiquidity)}`} />
          </div>
        </div>

        <div style={card}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Get started</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>
            Supply USDC to earn interest paid by farmers borrowing against
            verified, tokenised harvests. Your shares accrue value continuously.
          </p>

          <Link
            href="/investor/deposit"
            style={{
              display: "block",
              textAlign: "center",
              padding: "11px",
              borderRadius: 6,
              background: "var(--accent-green)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Deposit USDC
          </Link>

          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14, lineHeight: 1.5 }}>
            Need testnet USDC? Claim it from the Circle faucet, then import the
            token into your wallet.
          </p>
        </div>
      </div>
    </DashboardLayout>
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

function Bar({
  label,
  value,
  total,
  colour,
}: {
  label: string;
  value: bigint | undefined;
  total: bigint | undefined;
  colour: string;
}) {
  const pct =
    value !== undefined && total !== undefined && total > 0n
      ? Number((value * 10_000n) / total) / 100
      : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--bg-secondary)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: colour }} />
      </div>
    </div>
  );
}

export default withAuth(InvestorDashboard, "investor");
