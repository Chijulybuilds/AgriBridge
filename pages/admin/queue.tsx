import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { useEffect, useState } from "react";
import { getVerifierQueue, approveCommodity, rejectCommodity } from "../../lib/api";
import { CheckCircleIcon, XCircleIcon, ClockIcon } from "@heroicons/react/24/outline";

function AdminQueue() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);

  // Form Fields
  const [onChainId, setOnChainId] = useState<number>(1);
  const [inspectionRef, setInspectionRef] = useState("");
  const [warehouseRef, setWarehouseRef] = useState("");
  const [reportHash, setReportHash] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchQueue = () => {
    setLoading(true);
    getVerifierQueue()
      .then((data) => {
        setQueue(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load queue");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const openActionModal = (item: any, type: "approve" | "reject") => {
    setProcessingId(item.id);
    setActionType(type);
    setSubmitMessage(null);
    
    // Auto-generate helper default values for fast testing
    const randomId = Math.floor(1000 + Math.random() * 9000);
    setOnChainId(randomId);
    setInspectionRef(`INSP-REC-${randomId}`);
    setWarehouseRef(`WHSE-REF-${randomId}`);
    
    // Dummy Keccak256 hash for report_hash: 0x + 64 hex characters
    setReportHash("0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    setRejectReason("Quality standard not met (Grade C lower limits)");
  };

  const closeActionModal = () => {
    setProcessingId(null);
    setActionType(null);
    setSubmitMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!processingId || !actionType) return;
    setSubmitLoading(true);
    setSubmitMessage(null);

    try {
      if (actionType === "approve") {
        await approveCommodity(processingId, {
          on_chain_id: onChainId,
          inspection_reference: inspectionRef,
          warehouse_reference: warehouseRef,
          report_hash: reportHash,
        });
        setSubmitMessage({ type: "success", text: "Commodity approved and tokenized on-chain!" });
      } else {
        await rejectCommodity(processingId, {
          on_chain_id: onChainId,
          reason: rejectReason,
        });
        setSubmitMessage({ type: "success", text: "Commodity rejected and recorded on-chain." });
      }
      
      // Reload queue and close after delay
      setTimeout(() => {
        fetchQueue();
        closeActionModal();
      }, 1500);
    } catch (err: any) {
      setSubmitMessage({ type: "error", text: err.message || "Action failed." });
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <DashboardLayout userType="admin">
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "32px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>
          Verification Queue
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          Review and approve pending warehouse receipts to mint on-chain commodity tokens.
        </p>
      </div>

      {error && (
        <div style={{ background: "#fdecea", color: "#b71c1c", padding: "12px", borderRadius: "10px", fontSize: "14px", marginBottom: "20px" }}>
          {error}
        </div>
      )}

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px" }}>
        {loading ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading verifier queue...</p>
        ) : queue.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <CheckCircleIcon style={{ width: "48px", height: "48px", color: "var(--accent-green)", margin: "0 auto 12px" }} />
            <p style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "16px" }}>Queue is Empty</p>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>All agricultural commodities are processed.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                  <th style={{ padding: "12px 8px" }}>Farmer Wallet</th>
                  <th style={{ padding: "12px 8px" }}>Commodity</th>
                  <th style={{ padding: "12px 8px" }}>Quantity</th>
                  <th style={{ padding: "12px 8px" }}>Quality</th>
                  <th style={{ padding: "12px 8px" }}>Harvest Date</th>
                  <th style={{ padding: "12px 8px" }}>Duration</th>
                  <th style={{ padding: "12px 8px" }}>Status</th>
                  <th style={{ padding: "12px 8px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
                    <td style={{ padding: "12px 8px", fontFamily: "monospace" }}>
                      {item.farmer_wallet.slice(0, 8)}...{item.farmer_wallet.slice(-6)}
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>{item.commodity_type}</td>
                    <td style={{ padding: "12px 8px" }}>{item.quantity_kg.toLocaleString()} kg</td>
                    <td style={{ padding: "12px 8px" }}>{item.grade}</td>
                    <td style={{ padding: "12px 8px" }}>{item.harvest_date}</td>
                    <td style={{ padding: "12px 8px" }}>{item.storage_duration_days} days</td>
                    <td style={{ padding: "12px 8px" }}>
                      <span style={{
                        padding: "3px 8px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: 600,
                        background: "var(--accent-gold-bg)",
                        color: "var(--accent-gold)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}>
                        <ClockIcon style={{ width: "12px", height: "12px" }} />
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => openActionModal(item, "approve")}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            background: "var(--accent-green)",
                            color: "#fff",
                            border: "none",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: "12px",
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openActionModal(item, "reject")}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            background: "var(--accent-red)",
                            color: "#fff",
                            border: "none",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: "12px",
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

      {/* POPUP ACTION FORM MODAL */}
      {processingId && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "20px",
        }}>
          <div style={{
            background: "var(--bg-primary)",
            width: "100%",
            maxWidth: "450px",
            borderRadius: "16px",
            border: "1px solid var(--border)",
            padding: "24px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "16px" }}>
              {actionType === "approve" ? "Verify & Approve Commodity" : "Reject Commodity Submission"}
            </h3>

            {submitMessage && (
              <div style={{
                background: submitMessage.type === "success" ? "var(--accent-green-bg)" : "#fdecea",
                color: submitMessage.type === "success" ? "var(--accent-green)" : "#b71c1c",
                padding: "10px",
                borderRadius: "8px",
                fontSize: "13px",
                marginBottom: "16px",
                fontWeight: 500,
              }}>
                {submitMessage.text}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  On-chain ID (Numeric Reference)
                </label>
                <input
                  type="number"
                  value={onChainId}
                  onChange={(e) => setOnChainId(Number(e.target.value))}
                  required
                  style={{
                    width: "100%", padding: "10px", borderRadius: "8px",
                    border: "1px solid var(--border-light)", fontSize: "14px",
                    background: "transparent", color: "var(--text-primary)",
                  }}
                />
              </div>

              {actionType === "approve" ? (
                <>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                      Inspection Reference
                    </label>
                    <input
                      type="text"
                      value={inspectionRef}
                      onChange={(e) => setInspectionRef(e.target.value)}
                      required
                      style={{
                        width: "100%", padding: "10px", borderRadius: "8px",
                        border: "1px solid var(--border-light)", fontSize: "14px",
                        background: "transparent", color: "var(--text-primary)",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                      Warehouse Receipt Reference
                    </label>
                    <input
                      type="text"
                      value={warehouseRef}
                      onChange={(e) => setWarehouseRef(e.target.value)}
                      required
                      style={{
                        width: "100%", padding: "10px", borderRadius: "8px",
                        border: "1px solid var(--border-light)", fontSize: "14px",
                        background: "transparent", color: "var(--text-primary)",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                      Verification Report Hash (Bytes32)
                    </label>
                    <input
                      type="text"
                      value={reportHash}
                      onChange={(e) => setReportHash(e.target.value)}
                      required
                      pattern="^0x[a-fA-F0-9]{64}$"
                      title="Must be a valid 32-byte hex string (starting with 0x followed by 64 hex characters)"
                      style={{
                        width: "100%", padding: "10px", borderRadius: "8px",
                        border: "1px solid var(--border-light)", fontSize: "12px",
                        fontFamily: "monospace", background: "transparent", color: "var(--text-primary)",
                      }}
                    />
                  </div>
                </>
              ) : (
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Rejection Reason
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    required
                    rows={3}
                    style={{
                      width: "100%", padding: "10px", borderRadius: "8px",
                      border: "1px solid var(--border-light)", fontSize: "14px",
                      background: "transparent", color: "var(--text-primary)", resize: "vertical",
                    }}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={closeActionModal}
                  disabled={submitLoading}
                  style={{
                    padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border-light)",
                    background: "transparent", color: "var(--text-secondary)", fontWeight: 600,
                    cursor: "pointer", fontSize: "13px",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  style={{
                    padding: "10px 20px", borderRadius: "8px", border: "none",
                    background: actionType === "approve" ? "var(--accent-green)" : "var(--accent-red)",
                    color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "13px",
                    opacity: submitLoading ? 0.7 : 1,
                  }}
                >
                  {submitLoading ? "Processing..." : actionType === "approve" ? "Submit Approval" : "Submit Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default withAuth(AdminQueue, "admin");
