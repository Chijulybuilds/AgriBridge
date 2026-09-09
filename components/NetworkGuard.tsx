import { useAccount, useSwitchChain } from "wagmi";

import { activeChain } from "../lib/wagmi";
import { contractsConfigured, missingContracts } from "../lib/contracts/config";

const banner: React.CSSProperties = {
  background: "#fff8e1",
  color: "#8d6e00",
  border: "1px solid #ffe082",
  padding: "12px 16px",
  borderRadius: 12,
  fontSize: 13,
  marginBottom: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

/**
 * Warns when the app cannot transact, and says exactly why.
 *
 * Two failure modes look identical to a user otherwise: a wallet pointed at the
 * wrong network, and a build with no contract addresses configured. Both would
 * surface as unexplained reverts or empty data.
 */
export function NetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!contractsConfigured()) {
    return (
      <div style={{ ...banner, background: "#fdecea", color: "#b71c1c", borderColor: "#f5c6cb" }}>
        <span>
          Contract addresses are not configured: {missingContracts().join(", ")}. Run{" "}
          <code>make deploy-all</code> and copy the printed addresses into{" "}
          <code>.env.local</code>.
        </span>
      </div>
    );
  }

  if (!isConnected || chainId === activeChain.id) return null;

  return (
    <div style={banner} data-testid="wrong-network">
      <span>
        Your wallet is on the wrong network. AgriBridge runs on {activeChain.name}.
      </span>
      <button
        onClick={() => switchChain({ chainId: activeChain.id })}
        disabled={isPending}
        style={{
          background: "var(--accent-green)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 600,
          cursor: isPending ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {isPending ? "Switching…" : `Switch to ${activeChain.name}`}
      </button>
    </div>
  );
}
