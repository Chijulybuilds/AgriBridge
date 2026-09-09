import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import {
  dashboardPathFor,
  getCurrentUser,
  getSessionToken,
  getStoredProfile,
  type UserRole,
} from "../lib/auth";
import { useAuth } from "../pages/_app";

type ProtectedPageProps = Record<string, unknown>;

/**
 * Gates a page behind an authenticated session, and optionally behind a role.
 *
 * Unauthenticated visitors go to /login. A signed-in user who lands on a page
 * belonging to a different role is redirected to their own dashboard rather
 * than shown an error, since the nav is role-specific anyway.
 */
export default function withAuth(
  Component: React.ComponentType,
  requiredRole?: UserRole,
) {
  return function ProtectedPage(props: ProtectedPageProps) {
    const router = useRouter();
    const { setProfile } = useAuth();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
      let cancelled = false;

      async function check() {
        if (!getSessionToken()) {
          void router.replace("/login");
          return;
        }

        try {
          const result = await getCurrentUser();
          if (cancelled) return;

          const role = result?.profile?.role ?? getStoredProfile()?.role;
          if (!role) {
            void router.replace("/login");
            return;
          }

          if (result?.profile) setProfile(result.profile);

          if (requiredRole && role !== requiredRole) {
            void router.replace(dashboardPathFor(role));
            return;
          }

          setChecking(false);
        } catch {
          // authedFetch already cleared a rejected session.
          if (!cancelled) void router.replace("/login");
        }
      }

      void check();
      return () => {
        cancelled = true;
      };
      // router is intentionally the only dependency: re-running on setProfile
      // identity changes would refetch the profile on every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    if (checking) {
      return (
        <div
          data-testid="auth-checking"
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
              Checking your session…
            </p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
