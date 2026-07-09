import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  investorStats,
  liquidityPools,
  earningsChartData,
} from "../../lib/mockData";

export default function InvestorDashboard() {
  return (
    <DashboardLayout userType="investor">
      {/* PAGE HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "32px",
        }}
        div
      />
      <div>
        <h1
          style={{
            fontSize: "32px",
            fontWeight: 800,
            color: "var(--text-primary)",
            marginBottom: "6px",
          }}
        >
          Investor Dashboard
        </h1>

        <p
          style={{
            fontSize: "14px",
            color: "var(--text-secondary)",
          }}
        >
          Here's your investment portfolio overview.
        </p>
      </div>

      <button
        style={{
          background: "linear-gradient(135deg,#22c55e,#16a34a)",
          color: "#ffffff",
          border: "none",
          padding: "12px 22px",
          borderRadius: "12px",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: "14px",
          boxShadow: "0 10px 25px rgba(34,197,94,.25)",
          transition: "0.3s ease",
        }}
      >
        + Invest More
      </button>
      <div />

      {/* STAT CARDS */}
      <div
        className="stat-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          marginBottom: "32px",
        }}
      >
        {investorStats.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginBottom: "8px",
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.5px",
                marginBottom: "6px",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: stat.up ? "var(--accent-green)" : "var(--accent-red)",
              }}
            >
              {stat.change}
            </div>
          </div>
        ))}
      </div>

      {/* LIQUIDITY POOLS */}
      <div
        className="table-scroll"
        style={{
          background: "#ffffff",
          borderRadius: "22px",
          padding: "28px",
          marginBottom: "28px",
          boxShadow: "0 20px 50px rgba(15,23,42,.08)",
          border: "1px solid #eef2f7",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "28px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: 800,
                color: "#0f172a",
                margin: 0,
              }}
            >
              🌾 Liquidity Pools
            </h2>

            <p
              style={{
                color: "#64748b",
                fontSize: "14px",
                marginTop: "6px",
              }}
            >
              Invest in verified agricultural assets and earn stable passive
              returns.
            </p>
          </div>

          <button
            style={{
              background: "linear-gradient(135deg,#22c55e,#16a34a)",
              color: "#fff",
              border: "none",
              padding: "12px 22px",
              borderRadius: "12px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 12px 24px rgba(34,197,94,.25)",
            }}
          >
            Explore Pools →
          </button>
        </div>

        {/* Quick Overview */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: "18px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              background: "#f8fafc",
              borderRadius: "16px",
              padding: "18px",
            }}
          >
            <div style={{ fontSize: "13px", color: "#64748b" }}>
              Total Value Locked
            </div>

            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "#22c55e",
                marginTop: "6px",
              }}
            >
              $2.4M
            </div>
          </div>

          <div
            style={{
              background: "#f8fafc",
              borderRadius: "16px",
              padding: "18px",
            }}
          >
            <div style={{ fontSize: "13px", color: "#64748b" }}>
              Average APY
            </div>

            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "#2563eb",
                marginTop: "6px",
              }}
            >
              9.2%
            </div>
          </div>

          <div
            style={{
              background: "#f8fafc",
              borderRadius: "16px",
              padding: "18px",
            }}
          >
            <div style={{ fontSize: "13px", color: "#64748b" }}>
              Active Investors
            </div>

            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "#f59e0b",
                marginTop: "6px",
              }}
            >
              1,240
            </div>
          </div>
        </div>

        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
            padding: "8px 12px",
            marginBottom: "4px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          <span>Pool</span>
          <span>Total Liquidity</span>
          <span>My Deposit</span>
          <span>APY</span>
          <span>Risk</span>
        </div>

        {liquidityPools.map((pool) => (
          <div
            key={pool.id}
            style={{
              background: "#ffffff",
              border: "1px solid #edf2f7",
              borderRadius: "18px",
              padding: "22px",
              marginBottom: "18px",
              boxShadow: "0 10px 35px rgba(15,23,42,.06)",
              transition: ".3s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "20px" }}>{pool.image}</span>
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  {pool.name}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {pool.commodity}
                </div>
              </div>
            </div>
            <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
              ${pool.totalLiquidity.toLocaleString()}
            </span>
            <span
              style={{
                fontSize: "13px",
                color:
                  pool.myDeposit > 0
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            >
              {pool.myDeposit > 0 ? `$${pool.myDeposit.toLocaleString()}` : "—"}
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--accent-green)",
              }}
            >
              {pool.apy}%
            </span>
            <div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background:
                    pool.risk === "low"
                      ? "var(--accent-green-bg)"
                      : pool.risk === "medium"
                        ? "var(--accent-gold-bg)"
                        : "var(--accent-red-bg)",
                  color:
                    pool.risk === "low"
                      ? "var(--accent-green)"
                      : pool.risk === "medium"
                        ? "var(--accent-gold)"
                        : "var(--accent-red)",
                }}
              >
                {pool.risk}
              </span>
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
