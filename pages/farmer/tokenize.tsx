import DashboardLayout from "../../components/layout/DashboardLayout";
import { CubeIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { submitCommodity } from "../../lib/api";

export default function TokenizeCommodity() {
  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [unit, setUnit] = useState("kg");
  const [quality, setQuality] = useState("Grade A");
  const [location, setLocation] = useState("");
  const [warehouseReceipt, setWarehouseReceipt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await submitCommodity({
        type,
        quantity: Number(quantity),
        unit,
        quality,
        location,
        warehouseReceipt,
      });
      setSuccess("Commodity submitted — awaiting verifier review");
    } catch (err) {
      console.error("Submit failed", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout userType="farmer">
      {/* HEADER */}
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.3px",
            marginBottom: "4px",
          }}
        >
          Tokenize Commodity
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          Convert your agricultural asset into an on-chain token to access
          liquidity.
        </p>
      </div>

      <div
        className="two-col"
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: "24px",
        }}
      >
        {/* FORM */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                background: "var(--accent-green-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CubeIcon
                style={{
                  width: "16px",
                  height: "16px",
                  color: "var(--accent-green)",
                }}
              />
            </div>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Commodity Details
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Commodity Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-secondary)",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              >
                <option value="">Select Commodity</option>
                {[
                  "Cocoa Beans",
                  "Cassava",
                  "Maize",
                  "Palm Oil",
                  "Rice",
                  "Sorghum",
                ].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Quantity
              </label>
              <input
                value={quantity as any}
                onChange={(e) =>
                  setQuantity(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                type="number"
                placeholder="e.g. 5000"
                required
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-secondary)",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-secondary)",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              >
                {["kg", "tonnes", "litres", "bags"].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Quality Grade
              </label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-secondary)",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              >
                {["Grade A", "Grade B", "Grade C"].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Storage Location
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                type="text"
                placeholder="e.g. Ondo State Warehouse"
                required
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-secondary)",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Warehouse Receipt No.
              </label>
              <input
                value={warehouseReceipt}
                onChange={(e) => setWarehouseReceipt(e.target.value)}
                type="text"
                placeholder="e.g. WR-2025-00123"
                required
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-secondary)",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
            </div>

            {error && (
              <div style={{ color: "#c0392b", marginBottom: "8px" }}>
                {error}
              </div>
            )}
            {success && (
              <div
                style={{ color: "var(--accent-green)", marginBottom: "8px" }}
              >
                {success}
              </div>
            )}

            <button
              disabled={loading}
              type="submit"
              style={{
                width: "100%",
                padding: "11px",
                borderRadius: "7px",
                background: "var(--accent-green)",
                border: "none",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                marginTop: "8px",
              }}
            >
              {loading ? "Submitting…" : "Tokenize Asset →"}
            </button>
          </form>
        </div>

        {/* RIGHT SIDE */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* How it works */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "20px",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: "16px",
              }}
            >
              How tokenization works
            </div>
            {[
              [
                "Submit Details",
                "Fill in your commodity info and warehouse receipt.",
              ],
              [
                "Verification",
                "Our oracle verifies the commodity with the warehouse.",
              ],
              [
                "Token Minted",
                "An on-chain token is created representing your asset.",
              ],
              [
                "Access Liquidity",
                "Use your token as collateral to borrow funds.",
              ],
            ].map(([title, desc], i) => (
              <div
                key={title}
                style={{ display: "flex", gap: "12px", marginBottom: "14px" }}
              >
                <div
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: "var(--accent-green-bg)",
                    border: "1px solid var(--accent-green)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "var(--accent-green)",
                    flexShrink: 0,
                    marginTop: "1px",
                  }}
                >
                  {i + 1}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "2px",
                    }}
                  >
                    {title}
                  </div>
                  <div
                    style={{ fontSize: "12px", color: "var(--text-secondary)" }}
                  >
                    {desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Requirements */}
          <div
            style={{
              background: "var(--accent-green-bg)",
              border: "1px solid #c8e6c8",
              borderRadius: "8px",
              padding: "20px",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--accent-green)",
                marginBottom: "12px",
              }}
            >
              Requirements
            </div>
            {[
              "Valid warehouse receipt",
              "Commodity must be at a verified partner warehouse",
              "Minimum quantity: 500kg or equivalent",
              "Connected wallet for signing",
            ].map((req) => (
              <div
                key={req}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <CheckCircleIcon
                  style={{
                    width: "14px",
                    height: "14px",
                    color: "var(--accent-green)",
                    flexShrink: 0,
                    marginTop: "1px",
                  }}
                />
                <span
                  style={{ fontSize: "12px", color: "var(--text-secondary)" }}
                >
                  {req}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
