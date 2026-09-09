import Link from "next/link";
import {
  CubeIcon,
  BanknotesIcon,
  ClockIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { NetworkGuard } from "../../components/NetworkGuard";
import {
  useMyCommodities,
  useMyLoans,
  usePoolStats,
  formatUsdc,
} from "../../hooks/useProtocol";

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
  icon: typeof CubeIcon;
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
        style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)" }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function FarmerDashboard() {
  const { commodities, isLoading: commoditiesLoading } = useMyCommodities();
  const { loans } = useMyLoans();
  const pool = usePoolStats();

  const verified = commodities.filter((c) => c.status === "Verified").length;
  const pending = commodities.filter((c) => c.status === "Pending").length;
  const activeLoans = loans.filter((l) => l.status === 0);
  const outstandingDebt = activeLoans.reduce((sum, l) => sum + l.totalDebt, 0n);

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
          Farmer Dashboard
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Your harvests, collateral and loans, read live from the chain.
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
          icon={CubeIcon}
          label="Commodities"
          value={commoditiesLoading ? "…" : String(commodities.length)}
          sub={`${verified} verified, ${pending} pending`}
          testId="stat-commodities"
        />
        <StatCard
          icon={ShieldCheckIcon}
          label="Ready to borrow"
          value={String(verified)}
          sub="Verified and tokenised"
          accent="var(--accent-blue)"
        />
        <StatCard
          icon={BanknotesIcon}
          label="Outstanding debt"
          value={`$${formatUsdc(outstandingDebt)}`}
          sub={`${activeLoans.length} active loan${activeLoans.length === 1 ? "" : "s"}`}
          accent="var(--accent-gold)"
        />
        <StatCard
          icon={ClockIcon}
          label="Borrow APR"
          value={pool.borrowApr !== undefined ? `${pool.borrowApr.toFixed(2)}%` : "—"}
          sub={`$${formatUsdc(pool.availableLiquidity)} available`}
        />
      </div>

      <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
        <div style={card}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Recent commodities</h2>

          {commoditiesLoading ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</p>
          ) : commodities.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
              You have not registered any commodities yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {commodities.slice(0, 5).map((c) => (
                <div
                  key={c.id.toString()}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    {c.commodityType} #{c.id.toString()}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>{c.status}</span>
                </div>
              ))}
            </div>
          )}

          <Link
            href="/farmer/commodities"
            style={{
              display: "inline-block",
              marginTop: 16,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--accent-green)",
              textDecoration: "none",
            }}
          >
            View all →
          </Link>
        </div>

        <div style={card}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Next step</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>
            {verified > 0
              ? "You have verified collateral. Borrow against it to unlock working capital."
              : "Register a harvest on-chain to start the verification process."}
          </p>

          <Link
            href={verified > 0 ? "/farmer/borrow" : "/farmer/tokenize"}
            style={{
              display: "block",
              textAlign: "center",
              padding: 11,
              borderRadius: 6,
              background: "var(--accent-green)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {verified > 0 ? "Borrow funds" : "Tokenize a commodity"}
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default withAuth(FarmerDashboard, "farmer");
