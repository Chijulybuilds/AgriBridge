import { useConnect, useConnection, useConnectors } from "wagmi";

import { friendlyError } from "../../hooks/useTx";

/**
 * Sign-in with a browser wallet (MetaMask's extension, or the test wallet in
 * the end-to-end suite). Used when MetaMask Embedded Wallets is not configured,
 * i.e. in local development and tests.
 */
export function BrowserWalletSignIn() {
  const connectors = useConnectors();
  const { mutate: connect, isPending, error, variables } = useConnect();
  const { isConnected } = useConnection();

  // Wallets announced by the browser (EIP-6963) have real names; the generic
  // "Injected" entry is only offered when none announced itself.
  const named = connectors.filter((c) => c.id !== "injected");
  const options = named.length > 0 ? named : connectors;

  if (isConnected) return null;

  return (
    <div className="stack" style={{ gap: 8 }}>
      {options.length === 0 && (
        <p className="hint">No browser wallet found. Install MetaMask, or ask the team for the sign-in link.</p>
      )}
      {options.map((connector) => {
        const busy = isPending && variables?.connector === connector;
        return (
          <button
            key={connector.uid}
            className="btn btn-block"
            data-testid="connect-wallet"
            disabled={isPending}
            onClick={() => connect({ connector })}
          >
            {busy ? "Connecting…" : `Connect ${connector.id === "injected" ? "browser wallet" : connector.name}`}
          </button>
        );
      })}
      {error && <p className="form-error">{friendlyError(error)}</p>}
    </div>
  );
}
