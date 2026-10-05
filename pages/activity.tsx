import DashboardLayout from "../components/layout/DashboardLayout";
import withAuth from "../components/withAuth";
import { NetworkGuard } from "../components/NetworkGuard";
import { useAuth } from "./_app";
import { useActivity } from "../hooks/useActivity";
import { contracts, type ContractName } from "../lib/contracts/config";
import { activeChain } from "../lib/wagmi";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "24px",
  marginBottom: 20,
};

const explorer = activeChain.blockExplorers?.default.url;

const CONTRACT_LABELS: Record<ContractName, string> = {
  registry: "Commodity registry",
  commodityToken: "Crop tokens (ERC-1155)",
  priceOracle: "Price oracle",
  shareToken: "Pool shares (agUSDC)",
  lendingPool: "Lending pool",
  usdc: "USDC",
};

function when(timestamp?: number): string {
  if (!timestamp) return "—";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

function ExplorerLink({ path, label }: { path: string; label: string }) {
  if (!explorer) return <span style={{ fontFamily: "monospace", fontSize: 12 }}>{label}</span>;
  return (
    <a
      href={`${explorer}/${path}`}
      target="_blank"
      rel="noreferrer"
      style={{ fontFamily: "monospace", fontSize: 12, color: "var(--accent-blue)" }}
    >
      {label} ↗
    </a>
  );
}

/**
 * Every action in AgriBridge is a blockchain transaction. This page lists them,
 * newest first, with a link to each one on the block explorer.
 */
function Activity() {
  const { profile } = useAuth();
  const { data: items, isLoading, error } = useActivity();

  return (
    <DashboardLayout userType={profile?.role ?? "farmer"}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: 4 }}>
          On-chain Activity
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Every action in AgriBridge is a transaction on {activeChain.name}. Open any of them on the block explorer to
          see exactly what happened.
        </p>
      </div>

      <NetworkGuard />

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Transactions</div>
        {error ? (
          <p role="alert" style={{ color: "var(--accent-red)", fontSize: 13 }}>
            Could not read the activity: {error instanceof Error ? error.message.split("\n")[0] : "unknown error"}
          </p>
        ) : isLoading ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Reading the chain…</p>
        ) : !items?.length ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }} data-testid="activity-empty">
            No activity yet. Register a harvest, deposit, or borrow, and it shows up here.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }} data-testid="activity-table">
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 12 }}>
                  <th style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>When</th>
                  <th style={{ padding: "8px 6px" }}>What happened</th>
                  <th style={{ padding: "8px 6px" }}>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key} style={{ borderTop: "1px solid var(--border)" }} data-testid="activity-row">
                    <td style={{ padding: "10px 6px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {when(item.timestamp)}
                    </td>
                    <td style={{ padding: "10px 6px" }}>{item.text}</td>
                    <td style={{ padding: "10px 6px", whiteSpace: "nowrap" }}>
                      <ExplorerLink path={`tx/${item.txHash}`} label={`${item.txHash.slice(0, 10)}…`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Contracts</div>
        <div style={{ display: "grid", gap: 8 }}>
          {(Object.keys(CONTRACT_LABELS) as ContractName[]).map((name) => {
            const address = contracts[name];
            return (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, flexWrap: "wrap" }}>
                <span>{CONTRACT_LABELS[name]}</span>
                {address ? <ExplorerLink path={`address/${address}`} label={address} /> : <span>—</span>}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default withAuth(Activity);
