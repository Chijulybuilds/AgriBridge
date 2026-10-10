import { useConnection, useDisconnect } from "wagmi";

import { shortAddress } from "../../lib/format";
import { MetaMaskSignIn } from "./MetaMaskSignIn";

/* Sign-in controls for the public app, which signs people in with MetaMask. */

export function SignIn() {
  return <MetaMaskSignIn />;
}

/**
 * Signs out for real: MetaMask is asked to forget this site's permission (so the next visit asks
 * again, rather than reconnecting on its own), then the app disconnects.
 */
export function SignOut({ className }: { className?: string }) {
  const { connector } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  async function signOut() {
    try {
      const provider = (await connector?.getProvider()) as { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | undefined;
      await provider?.request?.({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    } catch {
      // Older wallets don't support revoking; disconnecting the app is still enough for this visit.
    }
    disconnect();
  }
  return (
    <button className={className} onClick={() => void signOut()} data-testid="sign-out">
      Sign out
    </button>
  );
}

export function AccountName() {
  const { address } = useConnection();
  return <span title={address}>{shortAddress(address)}</span>;
}
