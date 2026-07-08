import DashboardLayout from "../../components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import { getMyCommodities } from "../../lib/api";
import { PlusIcon, FunnelIcon } from "@heroicons/react/24/outline";

export default function FarmerCommodities() {
  const [commodities, setCommodities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getMyCommodities()
      .then((data) => {
        if (!mounted) return;
        setCommodities(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("Failed to load commodities", err);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <DashboardLayout userType="farmer">
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "32px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.3px",
              marginBottom: "4px",
            }}
          >
            My Commodities
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Manage and track your tokenized agricultural assets.
          </p>
        </div>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            borderRadius: "7px",
            fontSize: "13px",
            background: "var(--accent-green)",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          <PlusIcon style={{ width: "15px", height: "15px" }} />
          Add Commodity
        </button>
      </div>

      {/* STATS ROW */}
      <div
        className="stat-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          marginBottom: "28px",
        }}
      >
        {[
          { label: "Total Commodities", value: "4" },
          { label: "Tokenized", value: "2" },
          { label: "As Collateral", value: "1" },
          { label: "Total Value", value: "$36,900" },
        ].map((s) => (
          <div
            key={s.label}
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
                marginBottom: "6px",
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* TABLE */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {/* Table toolbar */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            All Commodities ({loading ? "..." : commodities.length})
          </span>
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              border: "1px solid var(--border-light)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <FunnelIcon style={{ width: "13px", height: "13px" }} />
            Filter
          </button>
        </div>

        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
            padding: "10px 20px",
            background: "var(--bg-secondary)",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span>Commodity</span>
          <span>Quantity</span>
          <span>Quality</span>
          <span>Token</span>
          <span>Value</span>
          <span>Status</span>
        </div>

        {/* Table rows */}
        {error && (
          <div style={{ padding: "14px 20px", color: "#c0392b" }}>
            Failed to load commodities: {error}
          </div>
        )}

        {!error && loading && (
          <div style={{ padding: "14px 20px" }}>Loading...</div>
        )}

        {!error &&
          !loading &&
          commodities.map((c, i) => (
            <div
              key={c.id ?? i}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
                padding: "14px 20px",
                alignItems: "center",
                borderBottom:
                  i < commodities.length - 1
                    ? "1px solid var(--border)"
                    : "none",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "var(--accent-green-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                    flexShrink: 0,
                  }}
                >
                  {c.image ?? "🌾"}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {c.type ?? c.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {(c.location || "").split(",")[0]}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                {(c.quantity ?? 0).toLocaleString()} {c.unit}
              </span>
              <span
                style={{ fontSize: "13px", color: "var(--text-secondary)" }}
              >
                {c.quality}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  fontFamily: "monospace",
                  color: "var(--accent-blue)",
                }}
              >
                {c.tokenSymbol ?? "-"}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                ${(c.tokenValue ?? 0).toLocaleString()}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  display: "inline-block",
                  background:
                    c.status === "tokenized"
                      ? "var(--accent-green-bg)"
                      : c.status === "collateral"
                        ? "var(--accent-gold-bg)"
                        : "var(--accent-blue-bg)",
                  color:
                    c.status === "tokenized"
                      ? "var(--accent-green)"
                      : c.status === "collateral"
                        ? "var(--accent-gold)"
                        : "var(--accent-blue)",
                }}
              >
                {c.status ?? "pending"}
              </span>
            </div>
          ))}
      </div>
    </DashboardLayout>
  );
}
