import { useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from "@web3auth/modal/react";

import { shortAddress } from "../../lib/format";

/*
 * MetaMask Embedded Wallets controls. This module imports the SDK, so it is
 * only ever loaded in the browser through components/wallet/index.tsx.
 */

/** Opens the MetaMask sign-in window: Google, email or phone, or an existing wallet. */
export function EmbeddedSignIn() {
  const { connect, loading, isConnected, error } = useWeb3AuthConnect();
  if (isConnected) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button className="btn btn-block" data-testid="sign-in" disabled={loading} onClick={() => void connect()}>
        {loading ? "Opening sign-in…" : "Continue with Google, email or phone"}
      </button>
      <p className="hint">
        No app to install and no passwords to remember. Your AgriBridge account is created the first time you sign in.
        Already use a crypto wallet? Choose it in the same window.
      </p>
      {error && <p className="form-error">{error.message}</p>}
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
