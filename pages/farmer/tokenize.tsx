import { useState } from "react";
import { useRouter } from "next/router";
import { CubeIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { NetworkGuard } from "../../components/NetworkGuard";
import { TxStatus } from "../../components/TxStatus";
import { useRegisterCommodity } from "../../hooks/useProtocol";
import { mirrorCommodity } from "../../lib/api";
import {
  COMMODITY_TYPES,
  GRADES,
  type CommodityType,
  type Grade,
} from "../../lib/contracts/config";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "24px",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 6,
  border: "1px solid var(--border-light)",
  background: "var(--bg-secondary)",
  fontSize: 13,
  color: "var(--text-primary)",
  outline: "none",
};

/** Matches the registry's own bounds on storage duration. */
const MIN_STORAGE_DAYS = 1;
const MAX_STORAGE_DAYS = 730;

function TokenizeCommodity() {
  const router = useRouter();
  const tx = useRegisterCommodity();

  const [commodityType, setCommodityType] = useState<CommodityType>("Cocoa");
  const [grade, setGrade] = useState<Grade>("A");
  const [quantityKg, setQuantityKg] = useState("");
  const [harvestDate, setHarvestDate] = useState("");
  const [storageDays, setStorageDays] = useState("180");
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const quantity = Number(quantityKg);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFormError("Enter a quantity greater than zero.");
      return;
    }
    if (!harvestDate) {
      setFormError("Select the harvest date.");
      return;
    }

    const harvest = new Date(harvestDate);
    if (harvest.getTime() > Date.now()) {
      setFormError("The harvest date cannot be in the future.");
      return;
    }

    const days = Number(storageDays);
    if (!Number.isInteger(days) || days < MIN_STORAGE_DAYS || days > MAX_STORAGE_DAYS) {
      setFormError(`Storage duration must be between ${MIN_STORAGE_DAYS} and ${MAX_STORAGE_DAYS} days.`);
      return;
    }

    try {
      // The farmer registers directly on-chain: the registry is the source of
      // truth. The backend copy is a searchable mirror for the verifier queue.
      await tx.register({
        commodityType,
        quantityKg: quantity,
        grade,
        harvestDate: harvest,
        storageDurationDays: days,
      });

      // A failed mirror must not read as a failed registration, since the
      // on-chain write has already succeeded by this point.
      try {
        await mirrorCommodity({
          commodity_type: commodityType,
          grade,
          quantity_kg: quantity,
          harvest_date: harvestDate,
          storage_duration_days: days,
        });
      } catch (mirrorError) {
        console.warn("Commodity registered on-chain but the backend mirror failed:", mirrorError);
      }

      setDone(true);
      setTimeout(() => router.push("/farmer/commodities"), 1800);
    } catch {
      // Reported through TxStatus.
    }
  }

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
          Tokenize Commodity
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Register your harvest on-chain. Once a verifier approves it, tokens are
          minted and you can borrow against them.
        </p>
      </div>

      <NetworkGuard />

      <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: "var(--accent-green-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CubeIcon style={{ width: 16, height: 16, color: "var(--accent-green)" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Commodity details</span>
          </div>

          {done ? (
            <div style={{ textAlign: "center", padding: "24px 0" }} data-testid="tokenize-success">
              <CheckCircleIcon
                style={{ width: 40, height: 40, color: "var(--accent-green)", margin: "0 auto 12px" }}
              />
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                Commodity registered
              </p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                It is now pending verification. Taking you to your commodities…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Commodity type</label>
                <select
                  value={commodityType}
                  onChange={(e) => setCommodityType(e.target.value as CommodityType)}
                  data-testid="commodity-type"
                  style={field}
                >
                  {COMMODITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Only these five types are supported on-chain.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={label}>Quantity (kg)</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={quantityKg}
                    onChange={(e) => setQuantityKg(e.target.value)}
                    placeholder="1000"
                    data-testid="quantity"
                    style={field}
                  />
                </div>
                <div>
                  <label style={label}>Grade</label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value as Grade)}
                    data-testid="grade"
                    style={field}
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        Grade {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={label}>Harvest date</label>
                  <input
                    type="date"
                    value={harvestDate}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setHarvestDate(e.target.value)}
                    data-testid="harvest-date"
                    style={field}
                  />
                </div>
                <div>
                  <label style={label}>Storage duration (days)</label>
                  <input
                    type="number"
                    min={MIN_STORAGE_DAYS}
                    max={MAX_STORAGE_DAYS}
                    value={storageDays}
                    onChange={(e) => setStorageDays(e.target.value)}
                    data-testid="storage-days"
                    style={field}
                  />
                </div>
              </div>

              {formError && (
                <p
                  data-testid="form-error"
                  style={{
                    background: "#fdecea",
                    color: "#b71c1c",
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={tx.isBusy}
                data-testid="submit-tokenize"
                style={{
                  width: "100%",
                  padding: 11,
                  borderRadius: 6,
                  border: "none",
                  background: tx.isBusy ? "var(--border)" : "var(--accent-green)",
                  color: tx.isBusy ? "var(--text-muted)" : "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: tx.isBusy ? "not-allowed" : "pointer",
                }}
              >
                {tx.isBusy ? "Registering…" : "Register on-chain"}
              </button>

              <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
            </form>
          )}
        </div>

        <div style={card}>
          <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 14 }}>
            What happens next
          </span>
          <ol
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.7,
              paddingLeft: 18,
              margin: 0,
            }}
          >
            <li>Your wallet signs the registration transaction.</li>
            <li>The commodity enters the verifier queue as Pending.</li>
            <li>A verifier inspects it and approves or rejects it.</li>
            <li>On approval, ERC-1155 tokens are minted to your wallet.</li>
            <li>You can then deposit them as collateral and borrow.</li>
          </ol>

          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 18,
              paddingTop: 14,
              borderTop: "1px solid var(--border)",
              lineHeight: 1.6,
            }}
          >
            Registering costs a small amount of gas. Nothing is minted until a
            verifier approves your submission.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default withAuth(TokenizeCommodity, "farmer");
