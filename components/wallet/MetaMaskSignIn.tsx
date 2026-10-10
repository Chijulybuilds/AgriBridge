import { useSyncExternalStore } from "react";
import { useConnect, useConnection, useConnectors } from "wagmi";

import { friendlyError } from "../../hooks/useTx";

const METAMASK_DOWNLOAD = "https://metamask.io/download/";

/** True only in the browser, after hydration, so the server and first client render agree. */
const useIsClient = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

/**
 * Sign-in with MetaMask, the only way into the app.
 *
 * - With the browser extension, or inside the MetaMask phone app's own browser, MetaMask is in
 *   the page: it announces itself (EIP-6963, "io.metamask" or "io.metamask.mobile"), or at least
 *   sets window.ethereum.isMetaMask, which the plain "injected" connector then reaches.
 * - On a phone in an ordinary browser (Chrome, Safari) MetaMask can't be in the page, so the
 *   button opens this same page inside the MetaMask app, where signing in works.
 * - The end-to-end tests (NEXT_PUBLIC_E2E) sign in with their own test wallet.
 */
export function MetaMaskSignIn() {
  const connectors = useConnectors();
  const { mutate: connect, isPending, error } = useConnect();
  const { isConnected } = useConnection();
  const isClient = useIsClient();

  if (isConnected) return null;

  if (!isClient) {
    return (
      <button className="btn btn-block" disabled>
        Looking for MetaMask…
      </button>
    );
  }

  const ethereum = (window as Window & { ethereum?: { isMetaMask?: boolean } }).ethereum;
  const announced = connectors.find((c) => c.id === "io.metamask" || c.id === "io.metamask.mobile");
  const injected = ethereum?.isMetaMask ? connectors.find((c) => c.id === "injected") : undefined;
  const testWallet = process.env.NEXT_PUBLIC_E2E ? connectors.find((c) => c.id !== "injected") : undefined;
  const connector = announced ?? injected ?? testWallet;

  if (!connector) {
    const onPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (onPhone) {
      // MetaMask's universal link opens the given page in the app's browser (or the store, if it isn't installed).
      const here = `${window.location.host}${window.location.pathname}${window.location.search}`;
      return (
        <div className="stack" style={{ gap: 8 }}>
          <a className="btn btn-block" href={`https://metamask.app.link/dapp/${here}`} data-testid="open-in-metamask">
            Open in MetaMask
          </a>
          <p className="hint">
            On a phone, AgriBridge runs inside the MetaMask app. This opens it there; then choose your role and tap Connect MetaMask.
          </p>
        </div>
      );
    }
    return (
      <div className="stack" style={{ gap: 8 }}>
        <a className="btn btn-block" href={METAMASK_DOWNLOAD} target="_blank" rel="noreferrer">
          Install MetaMask
        </a>
        <p className="hint">AgriBridge signs you in with MetaMask. Add it to this browser, then reload this page.</p>
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
