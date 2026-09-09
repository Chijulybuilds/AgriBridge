import DashboardLayout from "../../components/layout/DashboardLayout";
import withAuth from "../../components/withAuth";
import { useEffect, useState } from "react";
import { getVerifierQueue } from "../../lib/api";
import { ArchiveBoxIcon, ClockIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

function AdminDashboard() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getVerifierQueue()
      .then((data) => {
        if (!mounted) return;
        setQueue(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || "Failed to load queue");
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const stats = [
    { label: "Pending Verification", value: queue.length, icon: ClockIcon, color: "var(--accent-gold)" },
    { label: "Verification Standard", value: "Grade A-C Only", icon: ArchiveBoxIcon, color: "var(--accent-blue)" },
  ];

  return (
    <DashboardLayout userType="admin">
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "32px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>
          Verifier Dashboard
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          Review pending commodity submissions and process warehouse receipts.
        </p>
      </div>

      {/* STAT CARDS */}
      <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px", marginBottom: "32px" }}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>
                {stat.label}
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--text-primary)" }}>
                {stat.value}
              </div>
            </div>
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "var(--bg-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: stat.color,
            }}>
              <stat.icon style={{ width: "24px", height: "24px" }} />
            </div>
          </div>
        ))}
      </div>

      {/* QUEUE OVERVIEW */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
            Recent Pending Submissions
          </h2>
          <Link href="/admin/queue" style={{ fontSize: "13px", color: "var(--accent-blue)", textDecoration: "none", fontWeight: 600 }}>
            View Full Queue ({queue.length}) →
          </Link>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading pending list...</p>
        ) : error ? (
          <p style={{ color: "var(--accent-red)", fontSize: "14px" }}>{error}</p>
        ) : queue.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>No pending items in queue. All caught up!</p>
        ) : (
          <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                  <th style={{ padding: "12px 8px" }}>Farmer Wallet</th>
                  <th style={{ padding: "12px 8px" }}>Commodity</th>
                  <th style={{ padding: "12px 8px" }}>Quantity</th>
                  <th style={{ padding: "12px 8px" }}>Quality</th>
                  <th style={{ padding: "12px 8px" }}>Status</th>
                  <th style={{ padding: "12px 8px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.slice(0, 5).map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
                    <td style={{ padding: "12px 8px", fontFamily: "monospace" }}>
                      {item.farmer_wallet.slice(0, 6)}...{item.farmer_wallet.slice(-4)}
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>{item.commodity_type}</td>
                    <td style={{ padding: "12px 8px" }}>{item.quantity_kg.toLocaleString()} kg</td>
                    <td style={{ padding: "12px 8px" }}>{item.grade}</td>
                    <td style={{ padding: "12px 8px" }}>
                      <span style={{
                        padding: "3px 8px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: 600,
                        background: "var(--accent-gold-bg)",
                        color: "var(--accent-gold)",
                      }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <Link href="/admin/queue" style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        background: "var(--accent-blue)",
                        color: "#fff",
                        textDecoration: "none",
                        fontWeight: 600,
                        fontSize: "12px",
                      }}>
                        Verify
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default withAuth(AdminDashboard, "admin");
