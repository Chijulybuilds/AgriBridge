import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { getCurrentUser, getSession, signInWithWallet } from "../lib/auth";

export default function Login() {
  const router = useRouter();
  const role = (router.query.role as string) || "farmer";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = await getSession();
      if (!token) return;

      try {
        const response = await getCurrentUser();
        if (cancelled) return;

        const profileRole = (
          response?.profile as { role?: string } | null | undefined
        )?.role;
        const destinationRole = profileRole || role;
        const targetPath = `/${destinationRole}/dashboard`;

        if (router.pathname !== targetPath) {
          router.replace(targetPath);
        }
      } catch (err) {
        console.error("Session restore failed:", err);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [role, router]);

  async function handleWalletAuth() {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await signInWithWallet();
      if (result.session?.access_token) {
        const profileRole = (
          result.profile as { role?: string } | null | undefined
        )?.role;
        const destinationRole = profileRole || role;
        router.push(`/${destinationRole}/dashboard`);
        return;
      }

      setError("Wallet authentication did not return a session token.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Wallet authentication failed",
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
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
      <div
        style={{
          width: "100%",
          maxWidth: "360px",
          background: "var(--bg-primary)",
          borderRadius: "28px",
          boxShadow: "0 24px 70px rgba(17, 34, 17, 0.12)",
          border: "1px solid var(--border)",
          padding: "32px",
        }}
      >
        <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "4px" }}>
          Continue with MetaMask
        </h1>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            marginBottom: "24px",
          }}
        >
          Sign in or create your account with your wallet as{" "}
          {role === "farmer" ? "a Farmer" : "an Investor"}.
        </p>

        {error && (
          <p
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

        <button
          onClick={handleWalletAuth}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "12px",
            border: "none",
            background: "var(--accent-green)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Connecting MetaMask..." : "Connect MetaMask"}
        </button>

        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginTop: "16px",
            lineHeight: 1.5,
          }}
        >
          Your first wallet sign-in creates your account automatically. No email
          or password is needed.
        </p>
      </div>
    </main>
  );
}
