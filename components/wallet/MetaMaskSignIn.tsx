import { useConnect, useConnection, useConnectors } from "wagmi";

import { friendlyError } from "../../hooks/useTx";

const METAMASK_DOWNLOAD = "https://metamask.io/download/";

/**
 * Sign-in with MetaMask, the only way into the app. MetaMask announces itself to the page
 * (EIP-6963) as "io.metamask" (or "io.metamask.mobile" in its phone app's browser). The
 * end-to-end tests (NEXT_PUBLIC_E2E) sign in with their own test wallet instead.
 */
export function MetaMaskSignIn() {
  const connectors = useConnectors();
  const { mutate: connect, isPending, error } = useConnect();
  const { isConnected } = useConnection();

  const metaMask = connectors.find((c) => c.id === "io.metamask" || c.id === "io.metamask.mobile");
  const testWallet = process.env.NEXT_PUBLIC_E2E ? connectors.find((c) => c.id !== "injected") : undefined;
  const connector = metaMask ?? testWallet;

  if (isConnected) return null;

  if (!connector) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <a className="btn btn-block" href={METAMASK_DOWNLOAD} target="_blank" rel="noreferrer">
          Install MetaMask
        </a>
        <p className="hint">
          AgriBridge signs you in with MetaMask. Add it to your browser, then reload this page. On a phone, open this page in the
          MetaMask app&apos;s browser.
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <button className="btn btn-block" data-testid="connect-wallet" disabled={isPending} onClick={() => connect({ connector })}>
        {isPending ? "Connecting…" : "Connect MetaMask"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {friendlyError(error)}
        </p>
      )}
    </div>
  );
}
