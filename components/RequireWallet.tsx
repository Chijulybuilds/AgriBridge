import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import { useConnection } from "wagmi";

import { usesEmbeddedWallets } from "./providers";

/**
 * Shows its children only to someone signed in, and sends everyone else to the
 * sign-in page, which brings them back here afterwards. Not a security
 * boundary: every action is a transaction the contracts check.
 *
 * After a page load the wallet reconnects on its own, a moment after the first
 * render (longer for MetaMask Embedded Wallets, which starts up first), so the
 * redirect waits a little before deciding nobody is signed in.
 */
export function RequireWallet({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isConnected, status } = useConnection();
  const [patienceOver, setPatienceOver] = useState(false);

  useEffect(() => {
    if (isConnected) return;
    const timer = setTimeout(() => setPatienceOver(true), usesEmbeddedWallets ? 4_000 : 1_200);
    return () => clearTimeout(timer);
  }, [isConnected]);

  const settling = status === "connecting" || status === "reconnecting";
  useEffect(() => {
    if (patienceOver && !isConnected && !settling) {
      void router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
    }
  }, [patienceOver, isConnected, settling, router]);

  if (!isConnected) {
    return (
      <div data-testid="auth-checking" style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <p className="muted">Checking your sign-in…</p>
      </div>
    );
  }
  return <>{children}</>;
}
