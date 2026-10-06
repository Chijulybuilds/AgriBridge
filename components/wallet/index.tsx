import dynamic from "next/dynamic";
import { useConnection, useDisconnect } from "wagmi";

import { shortAddress } from "../../lib/format";
import { usesEmbeddedWallets } from "../providers";
import { BrowserWalletSignIn } from "./BrowserWalletSignIn";

/*
 * Sign-in controls that work in both wallet setups (see components/providers.tsx):
 * MetaMask Embedded Wallets when configured, plain browser wallets otherwise.
 */

const Embedded = {
  SignIn: dynamic(() => import("./EmbeddedWallet").then((m) => m.EmbeddedSignIn), { ssr: false }),
  SignOut: dynamic(() => import("./EmbeddedWallet").then((m) => m.EmbeddedSignOut), { ssr: false }),
  AccountName: dynamic(() => import("./EmbeddedWallet").then((m) => m.EmbeddedAccountName), { ssr: false }),
};

export function SignIn() {
  return usesEmbeddedWallets ? <Embedded.SignIn /> : <BrowserWalletSignIn />;
}

export function SignOut({ className }: { className?: string }) {
  const { mutate: disconnect } = useDisconnect();
  if (usesEmbeddedWallets) return <Embedded.SignOut className={className} />;
  return (
    <button className={className} onClick={() => disconnect()} data-testid="sign-out">
      Sign out
    </button>
  );
}

export function AccountName() {
  const { address } = useConnection();
  if (usesEmbeddedWallets) return <Embedded.AccountName address={address} />;
  return <span title={address}>{shortAddress(address)}</span>;
}
