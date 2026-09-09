import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

import { useSiweLogin } from "../hooks/useSiweLogin";
import { useAuth } from "./_app";
import {
  dashboardPathFor,
  getCurrentUser,
  getSessionToken,
  type SignupRole,
} from "../lib/auth";

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
  const { isConnected } = useAccount();
  const { signIn, isSigningIn, error } = useSiweLogin();
  const { setProfile } = useAuth();

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
