import { useState, useMemo } from "react";
import { CheckCircleIcon, ClockIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { useAccount } from "wagmi";
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { type Address, formatUnits } from "viem";

import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import {
  CommodityRegistryAbi,
  CommodityTokenAbi,
} from "../../lib/contracts/abis";
import { contracts, requireContract, statusFromIndex } from "../../lib/contracts/config";
import { isAdminWallet } from "../../lib/auth";

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

// Helper functions
function commodityTypeFromIndex(index: number): string {
  return ["Cocoa", "Rice", "Maize", "Cashew", "Yam"][index] ?? "Cocoa";
}

function gradeFromIndex(index: number): string {
  return ["A", "B", "C"][index] ?? "A";
}

/**
 * Admin Verification Queue - On-chain version
 * 
 * In the no-backend version:
 * 1. Read all pending commodities directly from the CommodityRegistry contract
 * 2. Admin verifies/rejects by signing transactions directly
 * 3. No off-chain database needed - all data is on-chain
 */
function AdminQueue() {
  const { address: walletAddress } = useAccount();
  const { writeContractAsync, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });
  
  const registry = contracts.registry;
  
  // Get all pending commodities from the registry
  const { data: commodityCountResult, isLoading: idsLoading } = useReadContracts({
    contracts: registry ? [
      { 
        address: registry, 
        abi: CommodityRegistryAbi, 
        functionName: "commodityCount" as const,
        args: [] as const,
      },
    ] : [],
    query: { enabled: Boolean(registry) },
  });
  
  const totalCommodities = commodityCountResult?.[0]?.result as bigint | undefined;
  
  // Fetch commodity details
  const { data: commodities, isLoading: commoditiesLoading } = useReadContracts({
    contracts: registry && totalCommodities && totalCommodities > 0n ? Array.from({ length: Number(totalCommodities) }, (_, i) => ({
      address: registry,
      abi: CommodityRegistryAbi,
      functionName: "getCommodity" as const,
      args: [BigInt(i)] as const,
    })) : [],
    query: { enabled: Boolean(registry && totalCommodities && totalCommodities > 0n) },
  });

  // Only show pending commodities
  const pendingCommodities = useMemo(() => {
    if (!commodities) return [];
    return commodities
      .map((entry, index) => {
        const value = entry.result as any;
        if (!value) return null;
        // Only include pending items
        if (Number(value.status) !== 0) return null; // 0 = Pending
        
        return {
          id: index.toString(),
          on_chain_id: index,
          farmer_wallet: value.farmer,
          commodity_type: commodityTypeFromIndex(Number(value.commodityType)),
          grade: gradeFromIndex(Number(value.grade)),
          quantity_kg: Number(formatUnits(value.quantity, 18)),
          harvest_date: new Date(Number(value.harvestDate) * 1000).toISOString().split("T")[0],
          status: statusFromIndex(Number(value.status)),
        };
      })
      .filter((c): c is any => c !== null);
  }, [commodities]);

  // Admin wallet check - only admin can verify
  const isAdmin = walletAddress && isAdminWallet(walletAddress);

  const [active, setActive] = useState<any | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [inspectionRef, setInspectionRef] = useState("");
  const [warehouseRef, setWarehouseRef] = useState("");
  const [reportHash, setReportHash] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const error = receiptError instanceof Error ? receiptError.message : receiptError ? "Transaction failed" : null;

  function openAction(id: string, type: "approve" | "reject") {
    const commodity = pendingCommodities.find(c => c.id === id);
    if (!commodity) return;
    
    setActive(commodity);
    setActionType(type);
    setActionMessage(null);
    setInspectionRef("");
    setWarehouseRef("");
    setReportHash("");
    setRejectReason("");
  }

  function closeAction() {
    setActive(null);
    setActionType(null);
    setActionMessage(null);
    reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !actionType || !registry) return;

    if (actionType === "approve" && !/^0x[a-fA-F0-9]{64}$/.test(reportHash)) {
      setActionMessage({
        type: "error",
        text: "The report hash must be 0x followed by 64 hexadecimal characters.",
      });
      return;
    }
    if (actionType === "approve" && (!inspectionRef.trim() || !warehouseRef.trim())) {
      setActionMessage({ type: "error", text: "Inspection and warehouse references are required." });
      return;
    }
    if (actionType === "reject" && !rejectReason.trim()) {
      setActionMessage({ type: "error", text: "Give a reason for the rejection." });
      return;
    }

    setSubmitting(true);
    setActionMessage(null);

    try {
      if (actionType === "approve") {
        // Call approveCommodity on the registry contract
        const onChainId = BigInt(active.on_chain_id);
        const txHash = await writeContractAsync({
          address: registry,
          abi: CommodityRegistryAbi,
          functionName: "approveCommodity",
          args: [onChainId],
        });
        
        setActionMessage({
          type: "success",
          text: `Transaction submitted: ${String(txHash).slice(0, 12)}...`,
        });
      } else {
        // Call rejectCommodity on the registry contract
        const onChainId = BigInt(active.on_chain_id);
        const reasonBytes32 = hexEncodeString(rejectReason);
        
        const txHash = await writeContractAsync({
          address: registry,
          abi: CommodityRegistryAbi,
          functionName: "rejectCommodity",
          args: [onChainId, reasonBytes32],
        });
        
        setActionMessage({
          type: "success",
          text: `Transaction submitted: ${String(txHash).slice(0, 12)}...`,
        });
      }
      
      // Reload the queue after a delay
      setTimeout(() => {
        closeAction();
      }, 2000);
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "The action failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Helper to encode string as bytes32
  function hexEncodeString(str: string): `0x${string}` {
    try {
      const truncated = str.substring(0, 31);
      // Simple hex encoding for the string
      let hex = "0x";
      for (let i = 0; i < truncated.length; i++) {
        hex += truncated.charCodeAt(i).toString(16).padStart(2, "0");
      }
      // Pad to 32 bytes (64 hex chars after 0x)
      while (hex.length < 66) {
        hex += "00";
      }
      return hex as `0x${string}`;
    } catch {
      return "0x" + "00".repeat(32) as `0x${string}`;
    }
  }

  // Check if admin wallet is configured
  if (!isAdmin) {
    return (
      <DashboardLayout userType="admin">
        <div style={card}>
          <XCircleIcon style={{ width: 48, height: 48, color: "var(--accent-red)", margin: "0 auto 16px" }} />
          <p style={{ textAlign: "center", fontSize: 14, color: "var(--text-primary)" }}>
            This wallet does not have admin privileges.
          </p>
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Only the configured admin wallet can access the verification queue.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const loading = idsLoading || commoditiesLoading;

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
        ) : pendingCommodities.length === 0 ? (
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
                {pendingCommodities.map((commodity) => (
                  <tr
                    key={commodity.id}
                    style={{ borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    <td style={{ padding: "12px 8px", fontFamily: "monospace" }}>
                      {commodity.farmer_wallet.slice(0, 8)}…{commodity.farmer_wallet.slice(-6)}
                    </td>
                    <td style={{ padding: "12px 8px", fontFamily: "monospace" }}>
                      {commodity.on_chain_id}
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>{commodity.commodity_type}</td>
                    <td style={{ padding: "12px 8px" }}>
                      {commodity.quantity_kg.toLocaleString()} kg
                    </td>
                    <td style={{ padding: "12px 8px" }}>{commodity.grade}</td>
                    <td style={{ padding: "12px 8px" }}>{commodity.harvest_date}</td>
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
                        {commodity.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => openAction(commodity.id, "approve")}
                          data-testid={`approve-${commodity.id}`}
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
                          onClick={() => openAction(commodity.id, "reject")}
                          data-testid={`reject-${commodity.id}`}
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

            {actionMessage && (
              <p
                data-testid="action-message"
                style={{
                  background: actionMessage.type === "success" ? "#e8f5e9" : "#fdecea",
                  color: actionMessage.type === "success" ? "#1b5e20" : "#b71c1c",
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {actionMessage.text}
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
