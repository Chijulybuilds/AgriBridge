import { useConnection, useSwitchChain } from "wagmi";

import { contractsConfigured, missingContracts } from "../lib/contracts/config";
import { activeChain } from "../lib/wagmi";
import { Notice } from "./ui";

/**
 * Says exactly why the app cannot work, instead of failing later with an
 * unexplained error: no contract addresses configured, or MetaMask on the
 * wrong network.
 */
export function NetworkGuard() {
  const { isConnected, chainId } = useConnection();
  const { mutate: switchChain, isPending } = useSwitchChain();

  if (!contractsConfigured()) {
    return (
      <Notice tone="danger" testId="config-missing">
        Contract addresses are not configured: {missingContracts().join(", ")}. Deploy with{" "}
        <code>make deploy-all</code> or <code>npm run demo:sepolia</code> and copy the printed
        addresses into <code>.env.local</code>.
      </Notice>
    );
  }

  if (!isConnected || chainId === activeChain.id) return null;

  return (
    <Notice tone="warn" testId="wrong-network">
      <div className="spread">
        <span>Your wallet is on another network. AgriBridge runs on {activeChain.name}.</span>
        <button className="btn btn-small" disabled={isPending} onClick={() => switchChain({ chainId: activeChain.id })}>
          {isPending ? "Switching…" : `Switch to ${activeChain.name}`}
        </button>
      </div>
    </Notice>
  );
}
