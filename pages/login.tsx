import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { CubeIcon } from "@heroicons/react/24/outline";

import { ThemeToggle } from "../components/ThemeToggle";
import { Segmented } from "../components/ui";
import { SignIn } from "../components/wallet";
import { APP_ROLES, getStoredRole, homeFor, isAppRole, storeRole, type AppRole } from "../lib/session";

const ROLE_HELP: Record<AppRole, string> = {
  farmer: "Store your crop in a warehouse, get a cash advance against it, or sell it.",
  investor: "Lend to farmers through the pool and earn interest.",
  buyer: "Buy graded crops from the warehouses, then collect or resell them.",
};

/**
 * Sign-in. With MetaMask Embedded Wallets, people continue with Google, email
 * or a phone number and their account (and wallet) is created on first sign-in.
 */
export default function Login() {
  const router = useRouter();
  const { isConnected } = useConnection();
  const [role, setRole] = useState<AppRole>("farmer");

  // The role comes from the link (?role=investor) or the one used last time.
  useEffect(() => {
    if (!router.isReady) return;
    const fromQuery = router.query.role;
    const initial = isAppRole(fromQuery) ? fromQuery : getStoredRole();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the query string is only known after hydration
    if (initial) setRole(initial);
  }, [router.isReady, router.query.role]);

  // Once signed in, go where the person was heading, or to their role's home.
  useEffect(() => {
    if (!isConnected || !router.isReady) return;
    storeRole(role);
    const next = typeof router.query.next === "string" && router.query.next.startsWith("/") ? router.query.next : homeFor(role);
    void router.replace(next);
  }, [isConnected, role, router]);

  return (
    <>
      <Head>
        <title>Sign in · AgriBridge</title>
      </Head>
      <div style={{ minHeight: "100vh", background: "var(--bg-secondary)", display: "grid", placeItems: "center", padding: 16 }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div className="spread" style={{ marginBottom: 20 }}>
            <Link href="/" className="row" style={{ gap: 8, textDecoration: "none", color: "var(--text-primary)" }}>
              <span style={{ width: 28, height: 28, borderRadius: 6, background: "var(--accent-green)", display: "grid", placeItems: "center" }}>
                <CubeIcon style={{ width: 16, height: 16, color: "#fff" }} />
              </span>
              <strong>
                Agri<span style={{ color: "var(--accent-green)" }}>Bridge</span>
              </strong>
            </Link>
            <ThemeToggle variant="minimal" />
          </div>

          <div className="card">
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Sign in</h1>
            <p className="text-secondary" style={{ fontSize: 13, marginBottom: 18 }}>
              Choose what you want to do first. You can switch at any time.
            </p>

            <div className="field">
              <label>I am a</label>
              <Segmented options={APP_ROLES} value={role} onChange={setRole} testIdPrefix="role" />
              <span className="hint">{ROLE_HELP[role]}</span>
            </div>

            <SignIn />
          </div>

          <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>
            Just looking? <Link className="link" href="/market">Browse the market</Link> without signing in.
          </p>
        </div>
      </div>
    </>
  );
}
