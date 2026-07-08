import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getCurrentUser, getSession, getStoredProfile } from "../lib/auth";

type ProtectedPageProps = Record<string, unknown>;

interface ProfileResponse {
  profile?: {
    role?: string | null;
  } | null;
}

export default function withAuth(
  Component: React.ComponentType,
  requiredRole?: string,
) {
  return function ProtectedPage(props: ProtectedPageProps) {
    const router = useRouter();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
      let cancelled = false;

      async function check() {
        const token = await getSession();

        if (!token) {
          if (router.pathname !== "/login") {
            router.replace("/login");
          }
          return;
        }

        try {
          const response = (await getCurrentUser()) as ProfileResponse;
          if (cancelled) return;

          const profileRole =
            response?.profile?.role ?? getStoredProfile()?.role;
          if (!profileRole) {
            if (router.pathname !== "/login") {
              router.replace("/login");
            }
            return;
          }

          if (requiredRole && profileRole !== requiredRole) {
            const targetPath = `/${profileRole}/dashboard`;
            if (router.pathname !== targetPath) {
              router.replace(targetPath);
            }
            return;
          }

          if (router.pathname === "/login") {
            router.replace(`/${profileRole}/dashboard`);
            return;
          }

          setChecking(false);
        } catch (err) {
          console.error("Auth check failed:", err);
          if (router.pathname !== "/login") {
            router.replace("/login");
          }
        }
      }

      void check();
      return () => {
        cancelled = true;
      };
    }, [router]);

    if (checking) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-primary)",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                border: "2px solid var(--accent-green)",
                borderTopColor: "transparent",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 12px",
              }}
            />
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Checking auth...
            </p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
