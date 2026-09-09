import Link from "next/link";
import { CubeIcon } from "@heroicons/react/24/outline";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { NetworkGuard } from "../../components/NetworkGuard";
import { useMyCommodities, formatKg, type OnChainCommodity } from "../../hooks/useProtocol";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "20px",
};

/** Colour per registry status. */
const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  Pending: { bg: "var(--accent-gold-bg)", fg: "var(--accent-gold)" },
  Verified: { bg: "var(--accent-green-bg)", fg: "var(--accent-green)" },
  Rejected: { bg: "#fdecea", fg: "var(--accent-red)" },
  Collateralized: { bg: "#e3f2fd", fg: "var(--accent-blue)" },
  Released: { bg: "var(--bg-secondary)", fg: "var(--text-secondary)" },
  Liquidated: { bg: "#fdecea", fg: "var(--accent-red)" },
  Expired: { bg: "var(--bg-secondary)", fg: "var(--text-muted)" },
};

function StatusBadge({ status }: { status: string }) {
  const colours = STATUS_COLOURS[status] ?? STATUS_COLOURS.Pending;
  return (
    <span
      style={{
        background: colours.bg,
        color: colours.fg,
        padding: "3px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

function formatDate(seconds: number) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString();
}

function MyCommodities() {
  const { commodities, isLoading } = useMyCommodities();

  const counts = commodities.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <DashboardLayout userType="farmer">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 32,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.3px",
              marginBottom: 4,
            }}
          >
            My Commodities
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Every harvest you have registered on-chain, with its current status.
          </p>
        </div>

        <Link
          href="/farmer/tokenize"
          style={{
            padding: "9px 18px",
            borderRadius: 6,
            background: "var(--accent-green)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Tokenize new
        </Link>
      </div>

      <NetworkGuard />

      <div
        className="stat-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <Stat label="Total" value={String(commodities.length)} />
        <Stat label="Pending" value={String(counts.Pending ?? 0)} />
        <Stat label="Verified" value={String(counts.Verified ?? 0)} highlight />
        <Stat label="Collateralized" value={String(counts.Collateralized ?? 0)} />
      </div>

      {isLoading ? (
        <div style={card}>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading your commodities…</p>
        </div>
      ) : commodities.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 48 }} data-testid="commodities-empty">
          <CubeIcon
            style={{ width: 36, height: 36, color: "var(--text-muted)", margin: "0 auto 12px" }}
          />
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No commodities yet</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Register your first harvest to begin the tokenisation process.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }} data-testid="commodities-list">
          {commodities.map((c: OnChainCommodity) => (
            <div key={c.id.toString()} style={card} data-testid={`commodity-${c.id}`}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>
                      {c.commodityType} #{c.id.toString()}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Grade {c.grade} · Harvested {formatDate(c.harvestDate)} · Storage ends{" "}
                    {formatDate(c.storageEndDate)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Quantity</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{formatKg(c.quantity)} kg</div>
                  </div>

                  {c.status === "Verified" && (
                    <Link
                      href="/farmer/borrow"
                      style={{
                        padding: "8px 16px",
                        borderRadius: 6,
                        border: "1px solid var(--accent-green)",
                        color: "var(--accent-green)",
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Borrow
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

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

export default withAuth(MyCommodities, "farmer");
