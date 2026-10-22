import { AUTH_CONNECTION, WALLET_CONNECTORS } from "@web3auth/modal";
import { useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from "@web3auth/modal/react";

import { shortAddress } from "../../lib/format";

/*
 * MetaMask Embedded Wallets controls. This module imports the SDK, so it is only ever loaded in the
 * browser, through components/wallet/index.tsx.
 */

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * Sign-in: "Continue with Google" goes straight to Google's sign-in, and creates the person's
 * wallet the first time, already connected. "Other ways" opens a window with email, a phone
 * number, or an existing wallet such as MetaMask.
 */
export function EmbeddedSignIn() {
  const { connect, connectTo, loading, isConnected, error } = useWeb3AuthConnect();
  if (isConnected) return null;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <button
        className="btn btn-block google-btn"
        data-testid="sign-in-google"
        data-tour="connect-wallet"
        disabled={loading}
        onClick={() => void connectTo(WALLET_CONNECTORS.AUTH, { authConnection: AUTH_CONNECTION.GOOGLE })}
      >
        <GoogleMark />
        {loading ? "Opening Google…" : "Continue with Google"}
      </button>
      <button className="btn btn-block btn-secondary" data-testid="sign-in" disabled={loading} onClick={() => void connect()}>
        Other ways: email, phone or MetaMask
      </button>
      <p className="hint">
        No app to install and no password to remember. Your AgriBridge account, a wallet in your name, is created the first time
        you sign in, and it is ready straight away.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {/^user closed|popup has been closed|cancel/i.test(error.message) ? "Sign-in was closed before it finished. Try again." : error.message}
        </p>
      )}
    </div>
  );
}

export function EmbeddedSignOut({ className }: { className?: string }) {
  const { disconnect, loading } = useWeb3AuthDisconnect();
  return (
    <button className={className} disabled={loading} onClick={() => void disconnect()} data-testid="sign-out">
      Sign out
    </button>
  );
}

/** The person's name or email from their sign-in, falling back to the wallet address. */
export function EmbeddedAccountName({ address }: { address?: string }) {
  const { userInfo } = useWeb3AuthUser();
  return <span title={address}>{userInfo?.name || userInfo?.email || shortAddress(address)}</span>;
}
