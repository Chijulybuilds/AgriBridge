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

/** Sign-in with MetaMask. Choosing a role only decides where the app opens; it is not a permission. */
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
            <p className="display" style={{ fontSize: "clamp(40px, 4.4vw, 60px)", lineHeight: 0.98, color: "inherit", marginBottom: 18 }}>
              Crop in storage becomes money you can use.
            </p>
            <p style={{ color: "var(--sidebar-ink-2)", fontSize: 16, maxWidth: 420 }}>
              Graded in partner warehouses, recorded on Ethereum, and checked by the contracts at every step.
            </p>
          </div>
          <ul className="stack" style={{ gap: 12, listStyle: "none" }}>
            {["Sign in with MetaMask: no account or password to create", "Your account is yours: AgriBridge never holds your key", "Every step has a public record you can check"].map((line) => (
              <li key={line} className="row" style={{ gap: 10, fontSize: 15, flexWrap: "nowrap" }}>
                <CheckIcon aria-hidden="true" style={{ width: 18, height: 18, color: "var(--maize)", flexShrink: 0 }} />
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

          <div style={{ maxWidth: 440, width: "100%", margin: "0 auto" }}>
            <h1 style={{ fontSize: 44, marginBottom: 10 }}>Sign in</h1>
            <p className="text-secondary" style={{ marginBottom: 24 }}>
              Choose what you want to do first. You can switch at any time.
            </p>

            <fieldset className="stack" style={{ gap: 10, marginBottom: 24, border: "none" }}>
              <legend className="visually-hidden">What do you want to do first?</legend>
              {APP_ROLES.map((r) => {
                const Icon = ROLE_DETAILS[r.id].icon;
                return (
                  <label key={r.id} className="role-card" data-testid={`role-${r.id}`}>
                    <span className="stat-icon tone-blue">
                      <Icon />
                    </span>
                    <span style={{ flex: 1 }}>
                      <strong style={{ display: "block", fontSize: 15 }}>{r.label}</strong>
                      <span className="muted" style={{ fontSize: 13.5 }}>
                        {ROLE_DETAILS[r.id].line}
                      </span>
                    </span>
                    <input type="radio" name="role" value={r.id} checked={r.id === role} onChange={() => setRole(r.id)} />
                  </label>
                );
              })}
            </fieldset>

            <SignIn />

            <p className="muted" style={{ textAlign: "center", marginTop: 24, fontSize: 14 }}>
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
          background: var(--sidebar-bg); color: var(--sidebar-ink);
          padding: 40px 48px; display: flex; flex-direction: column; justify-content: space-between; gap: 32px;
        }
        .login-main { padding: 28px 32px 40px; display: flex; flex-direction: column; justify-content: center; }
        .login-mobile-logo { display: none; }
        .role-card {
          display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; border-radius: 14px; cursor: pointer;
          background: var(--bg-card); border: 1px solid var(--border-light); font: inherit; color: var(--text-primary);
          transition-property: border-color, background-color; transition-duration: var(--dur-quick); transition-timing-function: var(--ease-out);
        }
        .role-card:hover { border-color: var(--line-input); }
        .role-card:has(input:checked) { border-color: var(--brand); background: var(--brand-soft); box-shadow: inset 0 0 0 1px var(--brand); }
        .role-card:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
        .role-card input:focus-visible { outline: none; }
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
