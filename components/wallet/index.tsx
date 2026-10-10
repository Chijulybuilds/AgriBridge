import { useConnection, useDisconnect } from "wagmi";

import { shortAddress } from "../../lib/format";
import { MetaMaskSignIn } from "./MetaMaskSignIn";

/* Sign-in controls for the public app, which signs people in with MetaMask. */

export function SignIn() {
  return <MetaMaskSignIn />;
}

export function SignOut({ className }: { className?: string }) {
  const { mutate: disconnect } = useDisconnect();
  return (
    <button className={className} onClick={() => disconnect()} data-testid="sign-out">
      Sign out
    </button>
  );
}

export function AccountName() {
  const { address } = useConnection();
  return <span title={address}>{shortAddress(address)}</span>;
}
