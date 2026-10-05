import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useConfig, useConnect, useDisconnect, useSwitchAccount } from "wagmi";
import { getAccount } from "wagmi/actions";

import { useSiweLogin } from "../hooks/useSiweLogin";
import { useAuth } from "./_app";
import {
  dashboardPathFor,
  getCurrentUser,
  getSessionToken,
  type SignupRole,
} from "../lib/auth";
import { demoAccounts, demoConnectorId, demoMode, type DemoRole } from "../lib/demo";

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: "420px",
  background: "var(--bg-primary)",
  borderRadius: "28px",
  boxShadow: "0 24px 70px rgba(17, 34, 17, 0.12)",
  border: "1px solid var(--border)",
  padding: "32px",
};

export default function Login() {
  const router = useRouter();
  const config = useConfig();
  const { isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchAccountAsync } = useSwitchAccount();
  const { signIn, isSigningIn, error } = useSiweLogin();
  const { setProfile } = useAuth();
  const [demoBusy, setDemoBusy] = useState<DemoRole | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);

  const queryRole = router.query.role;
  const role: SignupRole = queryRole === "investor" ? "investor" : "farmer";

  const [restoring, setRestoring] = useState(true);

  // If a valid session already exists, skip the sign-in step entirely.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!getSessionToken()) {
        if (!cancelled) setRestoring(false);
        return;
      }

      try {
        const result = await getCurrentUser();
        if (cancelled) return;
        if (result?.profile) {
          setProfile(result.profile);
          void router.replace(dashboardPathFor(result.profile.role));
          return;
        }
      } catch {
        // Expired or rejected token: fall through and show the sign-in card.
      }
      if (!cancelled) setRestoring(false);
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [router, setProfile]);

  async function handleSignIn() {
    const profile = await signIn(role);
    if (profile) {
      setProfile(profile);
      void router.push(dashboardPathFor(profile.role));
    }
  }

  /** One click: switch to the demo account's built-in wallet, then sign in with it. */
  async function enterAsDemo(demoRole: DemoRole) {
    setDemoError(null);
    setDemoBusy(demoRole);
    try {
      const target = connectors.find((c) => c.id === demoConnectorId(demoRole));
      if (!target) throw new Error("This demo account is not configured.");
      // Read the connection state now, not from the last render.
      const current = getAccount(config).connector;
      if (current?.uid !== target.uid) {
        if (config.state.connections.has(target.uid)) {
          await switchAccountAsync({ connector: target });
        } else {
          if (current) await disconnectAsync({ connector: current });
          await connectAsync({ connector: target });
        }
      }
      // The verifier becomes admin through its on-chain role, whatever is passed here.
      const profile = await signIn(demoRole === "investor" ? "investor" : "farmer");
      if (profile) {
        setProfile(profile);
        void router.push(dashboardPathFor(profile.role));
      }
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Could not sign in with the demo account.");
    } finally {
      setDemoBusy(null);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-secondary)",
        padding: "24px",
      }}
    >
      <div style={card}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "4px" }}>
          Sign in to AgriBridge
        </h1>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            marginBottom: "24px",
          }}
        >
          Connect your wallet and sign a message to continue as{" "}
          {role === "farmer" ? "a Farmer" : "an Investor"}. Signing is free and
          does not create a blockchain transaction.
        </p>

        {restoring ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Restoring your session…
          </p>
        ) : (
          <>
            {error && (
              <p
                data-testid="login-error"
                style={{
                  background: "#fdecea",
                  color: "#b71c1c",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                {error}
              </p>
            )}

            <div style={{ marginBottom: 16 }}>
              <ConnectButton showBalance={false} />
            </div>

            <button
              onClick={handleSignIn}
              disabled={!isConnected || isSigningIn}
              data-testid="siwe-sign-in"
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "12px",
                border: "none",
                background: isConnected ? "var(--accent-green)" : "var(--border)",
                color: isConnected ? "#fff" : "var(--text-muted)",
                fontSize: "14px",
                fontWeight: 600,
                cursor: !isConnected || isSigningIn ? "not-allowed" : "pointer",
                opacity: isSigningIn ? 0.7 : 1,
              }}
            >
              {isSigningIn
                ? "Waiting for signature…"
                : isConnected
                  ? "Sign in with Ethereum"
                  : "Connect a wallet first"}
            </button>

            {demoMode && (
              <div
                data-testid="demo-accounts"
                style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}
              >
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Demo accounts</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
                  Play money only. One click signs you in, no wallet needed.
                </p>
                {demoError && (
                  <p style={{ fontSize: 12, color: "#b71c1c", marginBottom: 8 }}>{demoError}</p>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {demoAccounts.map((demo) => (
                    <button
                      key={demo.role}
                      onClick={() => enterAsDemo(demo.role)}
                      disabled={demoBusy !== null || isSigningIn}
                      data-testid={`demo-${demo.role}`}
                      style={{
                        padding: "10px 6px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--bg-secondary)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: demoBusy !== null ? "not-allowed" : "pointer",
                        opacity: demoBusy !== null && demoBusy !== demo.role ? 0.5 : 1,
                      }}
                    >
                      {demoBusy === demo.role ? "Signing in…" : demo.label.replace("Demo ", "")}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginTop: "16px",
            lineHeight: 1.5,
          }}
        >
          Your first sign-in creates your account automatically. No email or
          password is needed.
        </p>
      </div>
    </main>
  );
}
