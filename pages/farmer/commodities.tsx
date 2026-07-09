import DashboardLayout from "../../components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getMyCommodities } from "../../lib/api";
import { PlusIcon, FunnelIcon } from "@heroicons/react/24/outline";

export default function FarmerCommodities() {
  const router = useRouter();
  const [commodities, setCommodities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");

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

  // Filter logic
  const filteredCommodities = commodities.filter((c) => {
    if (activeFilter === "all") return true;
    const status = (c.status || "Pending").toLowerCase();
    
    if (activeFilter === "verified") {
      return status === "verified" || status === "tokenized";
    }
    if (activeFilter === "collateralized") {
      return status === "collateralized" || status === "collateral";
    }
    return status === activeFilter;
  });

  // Dynamic statistics calculations
  const totalCount = commodities.length;
  
  const tokenizedCount = commodities.filter(
    (c) => c.status === "Verified" || c.status === "tokenized"
  ).length;

  const collateralCount = commodities.filter(
    (c) => c.status === "Collateralized" || c.status === "collateral"
  ).length;

  const totalValue = commodities.reduce((sum, c) => {
    const qty = c.quantity_kg !== undefined ? c.quantity_kg : (c.quantity || 0);
    let pricePerKg = 2.5;
    const type = (c.commodity_type || c.type || c.name || "").toLowerCase();
    if (type.includes("maize")) pricePerKg = 0.8;
    else if (type.includes("rice")) pricePerKg = 1.2;
    
    const val = c.tokenValue !== undefined ? c.tokenValue : qty * pricePerKg;
    return sum + val;
  }, 0);

  const stats = [
    { label: "Total Commodities", value: totalCount.toString() },
    { label: "Tokenized (Verified)", value: tokenizedCount.toString() },
    { label: "As Collateral", value: collateralCount.toString() },
    { label: "Total Value", value: `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
  ];

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
          onClick={() => router.push("/farmer/tokenize")}
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
        {stats.map((s) => (
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

      {/* FILTER TABS */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "16px",
          overflowX: "auto",
          paddingBottom: "4px",
        }}
      >
        {["All", "Pending", "Verified", "Collateralized", "Rejected"].map((tab) => {
          const value = tab.toLowerCase();
          const isActive = activeFilter === value;
          return (
            <button
              key={tab}
              onClick={() => setActiveFilter(value)}
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 600,
                border: "1px solid var(--border)",
                background: isActive ? "var(--accent-green)" : "var(--bg-card)",
                color: isActive ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
              }}
            >
              {tab}
            </button>
          );
        })}
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
            Commodities ({loading ? "..." : filteredCommodities.length})
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
            <FunnelIcon style={{ width: "13px", height: "13px" }} />
            <span>Filter Active</span>
          </div>
        </div>

        {/* Scrollable container for table content */}
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "400px" }}>
          {/* Table Header - enforces minimum width so columns don't squish */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2.2fr 1fr 1fr 1fr 1fr 1fr",
              minWidth: "750px",
              padding: "10px 20px",
              background: "var(--bg-secondary)",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              borderBottom: "1px solid var(--border)",
              position: "sticky",
              top: 0,
              zIndex: 10,
            }}
          >
            <span>Commodity</span>
            <span>Quantity</span>
            <span>Quality</span>
            <span>Token ID</span>
            <span>Est. Value</span>
            <span>Status</span>
          </div>

          {/* Table rows */}
          {error && (
            <div style={{ padding: "14px 20px", color: "#c0392b" }}>
              Failed to load commodities: {error}
            </div>
          )}

          {!error && loading && (
            <div style={{ padding: "14px 20px", color: "var(--text-secondary)" }}>Loading...</div>
          )}

          {!error && !loading && filteredCommodities.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
              No commodities found matching filter "{activeFilter}".
            </div>
          )}

          {!error &&
            !loading &&
            filteredCommodities.map((c, i) => {
              const type = c.commodity_type || c.type || c.name || "Unknown";
              const qty = c.quantity_kg !== undefined ? c.quantity_kg : (c.quantity || 0);
              const unit = c.unit || "kg";
              const grade = c.grade !== undefined ? `Grade ${c.grade}` : (c.quality || "Grade A");
              const tokenSymbol = c.token_id !== null && c.token_id !== undefined ? `CROP-${c.token_id}` : (c.tokenSymbol || "-");
              
              let pricePerKg = 2.5;
              if (type.toLowerCase().includes("maize")) pricePerKg = 0.8;
              else if (type.toLowerCase().includes("rice")) pricePerKg = 1.2;
              const value = c.tokenValue !== undefined ? c.tokenValue : qty * pricePerKg;

              const isVerified = c.status === "Verified" || c.status === "tokenized";
              const isCollateral = c.status === "Collateralized" || c.status === "collateral";
              const isRejected = c.status === "Rejected";

              let icon = "🌾";
              const typeLower = type.toLowerCase();
              if (typeLower.includes("cocoa")) icon = "🫘";
              else if (typeLower.includes("cassava") || typeLower.includes("yam")) icon = "🌿";
              else if (typeLower.includes("maize")) icon = "🌽";
              else if (typeLower.includes("oil")) icon = "🫙";

              return (
                <div
                  key={c.id ?? i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2.2fr 1fr 1fr 1fr 1fr 1fr",
                    minWidth: "750px",
                    padding: "14px 20px",
                    alignItems: "center",
                    borderBottom:
                      i < filteredCommodities.length - 1
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
                      {icon}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {type}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {c.location ? c.location.split(",")[0] : "Local Warehouse"}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                    {qty.toLocaleString()} {unit}
                  </span>
                  <span
                    style={{ fontSize: "13px", color: "var(--text-secondary)" }}
                  >
                    {grade}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontFamily: "monospace",
                      color: "var(--accent-blue)",
                    }}
                  >
                    {tokenSymbol}
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: "4px",
                      display: "inline-block",
                      background: isVerified
                        ? "var(--accent-green-bg)"
                        : isCollateral
                        ? "var(--accent-gold-bg)"
                        : isRejected
                        ? "#fdecea"
                        : "var(--accent-blue-bg)",
                      color: isVerified
                        ? "var(--accent-green)"
                        : isCollateral
                        ? "var(--accent-gold)"
                        : isRejected
                        ? "#b71c1c"
                        : "var(--accent-blue)",
                    }}
                  >
                    {(c.status || "Pending").toLowerCase()}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </DashboardLayout>
  );
}
