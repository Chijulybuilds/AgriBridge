import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircleIcon, ClockIcon } from "@heroicons/react/24/outline";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import {
  getVerifierQueue,
  approveCommodity,
  rejectCommodity,
  type CommodityRecord,
} from "../../lib/api";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
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

const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

/** Matches the backend's validation: 0x plus exactly 64 hex characters. */
const REPORT_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

function AdminQueue() {
  // React Query owns the fetch, so there is no effect writing state on mount.
  const {
    data: queue = [],
    isLoading: loading,
    error: queryError,
    refetch: fetchQueue,
  } = useQuery({
    queryKey: ["verifier-queue"],
    queryFn: getVerifierQueue,
  });

  const error =
    queryError instanceof Error ? queryError.message : queryError ? "Failed to load the queue" : null;

  const [active, setActive] = useState<CommodityRecord | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [inspectionRef, setInspectionRef] = useState("");
  const [warehouseRef, setWarehouseRef] = useState("");
  const [reportHash, setReportHash] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function openAction(item: CommodityRecord, type: "approve" | "reject") {
    setActive(item);
    setActionType(type);
    setMessage(null);
    setInspectionRef("");
    setWarehouseRef("");
    setReportHash("");
    setRejectReason("");
  }

  function closeAction() {
    setActive(null);
    setActionType(null);
    setMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !actionType) return;

    // The on-chain id comes from the commodity record itself. It is never
    // generated here: approving a fabricated id would either revert or, worse,
    // approve an unrelated commodity belonging to someone else.
    if (active.on_chain_id === null || active.on_chain_id === undefined) {
      setMessage({
        type: "error",
        text: "This record has no on-chain id yet. The farmer's registration transaction may still be pending.",
      });
      return;
    }

    if (actionType === "approve" && !REPORT_HASH_PATTERN.test(reportHash)) {
      setMessage({
        type: "error",
        text: "The report hash must be 0x followed by 64 hexadecimal characters.",
      });
      return;
    }
    if (actionType === "approve" && (!inspectionRef.trim() || !warehouseRef.trim())) {
      setMessage({ type: "error", text: "Inspection and warehouse references are required." });
      return;
    }
    if (actionType === "reject" && !rejectReason.trim()) {
      setMessage({ type: "error", text: "Give a reason for the rejection." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      if (actionType === "approve") {
        const result = await approveCommodity(active.id, {
          on_chain_id: active.on_chain_id,
          inspection_reference: inspectionRef.trim(),
          warehouse_reference: warehouseRef.trim(),
          report_hash: reportHash,
        });
        setMessage({
          type: "success",
          text: result?.tx_hash
            ? `Approved on-chain. Transaction ${String(result.tx_hash).slice(0, 12)}…`
            : "Approved. Collateral tokens have been minted to the farmer.",
        });
      } else {
        const result = await rejectCommodity(active.id, {
          on_chain_id: active.on_chain_id,
          reason: rejectReason.trim(),
        });
        setMessage({
          type: "success",
          text: result?.tx_hash
            ? `Rejected on-chain. Transaction ${String(result.tx_hash).slice(0, 12)}…`
            : "Rejected and recorded on-chain.",
        });
      }

      await fetchQueue();
      setTimeout(closeAction, 1500);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "The action failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout userType="admin">
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
          Verification Queue
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Review pending submissions. Approving mints collateral tokens to the
          farmer on-chain; rejecting records the reason on-chain.
        </p>
      </div>

      {error && (
        <div
          data-testid="queue-error"
          style={{
            background: "#fdecea",
            color: "#b71c1c",
            padding: 12,
            borderRadius: 10,
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      <div style={card}>
        {loading ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading the queue…</p>
        ) : queue.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }} data-testid="queue-empty">
            <CheckCircleIcon
              style={{ width: 44, height: 44, color: "var(--accent-green)", margin: "0 auto 12px" }}
            />
            <p style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 15 }}>
              Queue is empty
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              Every submission has been processed.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table
              data-testid="queue-table"
              style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                  <th style={{ padding: "12px 8px" }}>Farmer</th>
                  <th style={{ padding: "12px 8px" }}>On-chain id</th>
                  <th style={{ padding: "12px 8px" }}>Commodity</th>
                  <th style={{ padding: "12px 8px" }}>Quantity</th>
                  <th style={{ padding: "12px 8px" }}>Grade</th>
                  <th style={{ padding: "12px 8px" }}>Harvest</th>
                  <th style={{ padding: "12px 8px" }}>Status</th>
                  <th style={{ padding: "12px 8px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    <td style={{ padding: "12px 8px", fontFamily: "monospace" }}>
                      {item.farmer_wallet.slice(0, 8)}…{item.farmer_wallet.slice(-6)}
                    </td>
                    <td style={{ padding: "12px 8px", fontFamily: "monospace" }}>
                      {item.on_chain_id ?? "—"}
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>{item.commodity_type}</td>
                    <td style={{ padding: "12px 8px" }}>
                      {Number(item.quantity_kg).toLocaleString()} kg
                    </td>
                    <td style={{ padding: "12px 8px" }}>{item.grade}</td>
                    <td style={{ padding: "12px 8px" }}>{item.harvest_date}</td>
                    <td style={{ padding: "12px 8px" }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          background: "var(--accent-gold-bg)",
                          color: "var(--accent-gold)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <ClockIcon style={{ width: 12, height: 12 }} />
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => openAction(item, "approve")}
                          data-testid={`approve-${item.id}`}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: "var(--accent-green)",
                            color: "#fff",
                            border: "none",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openAction(item, "reject")}
                          data-testid={`reject-${item.id}`}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: "var(--accent-red)",
                            color: "#fff",
                            border: "none",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {active && actionType && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="action-modal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 34, 17, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 50,
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{ ...card, width: "100%", maxWidth: 460, background: "var(--bg-primary)" }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {actionType === "approve" ? "Approve" : "Reject"} {active.commodity_type}
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
              On-chain id {String(active.on_chain_id ?? "unassigned")} ·{" "}
              {Number(active.quantity_kg).toLocaleString()} kg · Grade {active.grade}
            </p>

            {actionType === "approve" ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={label}>Inspection reference</label>
                  <input
                    value={inspectionRef}
                    onChange={(e) => setInspectionRef(e.target.value)}
                    placeholder="INSP-2026-00142"
                    data-testid="inspection-ref"
                    style={field}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={label}>Warehouse reference</label>
                  <input
                    value={warehouseRef}
                    onChange={(e) => setWarehouseRef(e.target.value)}
                    placeholder="WHSE-LAG-0093"
                    data-testid="warehouse-ref"
                    style={field}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={label}>Report hash</label>
                  <input
                    value={reportHash}
                    onChange={(e) => setReportHash(e.target.value)}
                    placeholder="0x…"
                    data-testid="report-hash"
                    style={{ ...field, fontFamily: "monospace" }}
                  />
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                    Keccak-256 of the signed inspection report: 0x followed by 64
                    hexadecimal characters.
                  </p>
                </div>
              </>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={label}>Reason</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Quality below the declared grade"
                  data-testid="reject-reason"
                  style={{ ...field, resize: "vertical" }}
                />
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                  Stored on-chain as bytes32, so only the first 31 characters are
                  recorded.
                </p>
              </div>
            )}

            {message && (
              <p
                data-testid="action-message"
                style={{
                  background: message.type === "success" ? "#e8f5e9" : "#fdecea",
                  color: message.type === "success" ? "#1b5e20" : "#b71c1c",
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {message.text}
              </p>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={closeAction}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: 11,
                  borderRadius: 6,
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                data-testid="confirm-action"
                style={{
                  flex: 1,
                  padding: 11,
                  borderRadius: 6,
                  border: "none",
                  background:
                    actionType === "approve" ? "var(--accent-green)" : "var(--accent-red)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting
                  ? "Submitting…"
                  : actionType === "approve"
                    ? "Approve on-chain"
                    : "Reject on-chain"}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}

export default withAuth(AdminQueue, "admin");
