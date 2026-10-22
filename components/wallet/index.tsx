import dynamic from "next/dynamic";
import { useConnection, useDisconnect } from "wagmi";

import { shortAddress } from "../../lib/format";
import { usesEmbeddedWallets } from "../providers";
import { MetaMaskSignIn } from "./MetaMaskSignIn";

/*
 * Sign-in controls for both wallet setups (see components/providers.tsx): Google, email or phone
 * when MetaMask Embedded Wallets is configured, MetaMask otherwise.
 */

const Embedded = {
  SignIn: dynamic(() => import("./EmbeddedWallet").then((m) => m.EmbeddedSignIn), { ssr: false }),
  SignOut: dynamic(() => import("./EmbeddedWallet").then((m) => m.EmbeddedSignOut), { ssr: false }),
  AccountName: dynamic(() => import("./EmbeddedWallet").then((m) => m.EmbeddedAccountName), { ssr: false }),
};

export function SignIn() {
  return usesEmbeddedWallets ? <Embedded.SignIn /> : <MetaMaskSignIn />;
}

/**
 * Signs out for real: MetaMask is asked to forget this site's permission (so the next visit asks
 * again, rather than reconnecting on its own), then the app disconnects.
 */
export function SignOut({ className }: { className?: string }) {
  if (usesEmbeddedWallets) return <Embedded.SignOut className={className} />;
  return <MetaMaskSignOut className={className} />;
}

function MetaMaskSignOut({ className }: { className?: string }) {
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
  if (usesEmbeddedWallets) return <Embedded.AccountName address={address} />;
  return <span title={address}>{shortAddress(address)}</span>;
}
