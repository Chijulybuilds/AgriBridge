import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { BanknotesIcon, BuildingStorefrontIcon, CheckIcon, SunIcon } from "@heroicons/react/24/outline";

import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { SignIn } from "../components/wallet";
import { APP_ROLES, getStoredRole, homeFor, isAppRole, storeRole, type AppRole } from "../lib/session";

const ROLE_DETAILS: Record<AppRole, { icon: typeof SunIcon; line: string }> = {
  farmer: { icon: SunIcon, line: "Store your crop, get a cash advance against it, or sell it." },
  investor: { icon: BanknotesIcon, line: "Lend to farmers through the pool and earn interest." },
  buyer: { icon: BuildingStorefrontIcon, line: "Buy graded crop from the warehouses, then collect or resell it." },
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
      <div className="login-shell">
        <aside className="login-brand">
          <Logo size={34} tone="onDark" />
          <div>
            <h1 className="display" style={{ fontSize: 38, lineHeight: 1.1, color: "#f4efe2", marginBottom: 16 }}>
              Crop in storage becomes money you can use.
            </h1>
            <p style={{ color: "rgba(244, 239, 226, 0.78)", fontSize: 15, maxWidth: 420 }}>
              Graded in partner warehouses, recorded on Ethereum, and checked by the contracts at every step.
            </p>
          </div>
          <ul className="stack" style={{ gap: 10, listStyle: "none" }}>
            {["No app to install, no passwords to remember", "Your account is yours: AgriBridge never holds your key", "Every step has a public record you can check"].map((line) => (
              <li key={line} className="row" style={{ gap: 10, color: "rgba(244, 239, 226, 0.88)", fontSize: 13.5, flexWrap: "nowrap" }}>
                <CheckIcon style={{ width: 16, height: 16, color: "#e0a93b", flexShrink: 0 }} />
                {line}
              </li>
            ))}
          </ul>
        </aside>

        <main className="login-main">
          <div className="spread" style={{ marginBottom: 28 }}>
            <span className="login-mobile-logo">
              <Logo size={28} />
            </span>
            <span style={{ marginLeft: "auto" }}>
              <ThemeToggle />
            </span>
          </div>

          <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
            <span className="page-eyebrow">Welcome</span>
            <h2 className="display" style={{ fontSize: 30, marginBottom: 6 }}>
              Sign in
            </h2>
            <p className="text-secondary" style={{ marginBottom: 22 }}>
              Choose what you want to do first. You can switch at any time.
            </p>

            <div className="stack" style={{ gap: 10, marginBottom: 22 }} role="radiogroup" aria-label="I am a">
              {APP_ROLES.map((r) => {
                const Icon = ROLE_DETAILS[r.id].icon;
                const selected = r.id === role;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`role-${r.id}`}
                    onClick={() => setRole(r.id)}
                    className="role-card"
                  >
                    <span className={`stat-icon ${selected ? "tone-green" : "tone-gold"}`}>
                      <Icon />
                    </span>
                    <span style={{ textAlign: "left" }}>
                      <strong style={{ display: "block", fontSize: 14 }}>{r.label}</strong>
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        {ROLE_DETAILS[r.id].line}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <SignIn />

            <p className="muted" style={{ textAlign: "center", marginTop: 22, fontSize: 13 }}>
              Just looking?{" "}
              <Link className="link" href="/market">
                Browse the market
              </Link>{" "}
              without signing in.
            </p>
          </div>
        </main>
      </div>
      <style>{`
        .login-shell { min-height: 100vh; display: grid; grid-template-columns: minmax(360px, 0.9fr) 1.1fr; background: var(--bg-primary); }
        .login-brand {
          background-color: #143d25;
          background-image: repeating-linear-gradient(-24deg, rgba(255,255,255,0.045) 0, rgba(255,255,255,0.045) 2px, transparent 2px, transparent 22px),
            radial-gradient(120% 80% at 0% 100%, rgba(224,169,59,0.22), transparent 60%);
          color: #f4efe2; padding: 40px 44px; display: flex; flex-direction: column; justify-content: space-between; gap: 32px;
        }
        .login-main { padding: 28px 32px 40px; display: flex; flex-direction: column; justify-content: center; }
        .login-mobile-logo { display: none; }
        .role-card {
          display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; border-radius: 14px; cursor: pointer;
          background: var(--bg-card); border: 1px solid var(--border); box-shadow: var(--shadow-sm); font: inherit; color: var(--text-primary);
        }
        .role-card:hover { border-color: var(--border-light); }
        .role-card[aria-checked="true"] { border-color: var(--accent-green); box-shadow: 0 0 0 4px var(--ring); }
        @media (max-width: 860px) {
          .login-shell { grid-template-columns: 1fr; }
          .login-brand { display: none; }
          .login-mobile-logo { display: inline-flex; }
          .login-main { padding: 20px 16px 32px; justify-content: flex-start; }
        }
      `}</style>
    </>
  );
}
