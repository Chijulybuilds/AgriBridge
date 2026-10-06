import { useEffect, useState } from "react";

/**
 * Which part of the app someone is using: farming, investing or buying.
 *
 * This is a display preference, not a permission. Anyone may deliver a crop,
 * lend to the pool or buy on the market; the contracts check every action. Who
 * someone is comes from their wallet connection (MetaMask Embedded Wallets sign-in,
 * or a browser wallet), so there is no separate session to keep.
 */
export type AppRole = "farmer" | "investor" | "buyer";

export const APP_ROLES: ReadonlyArray<{ id: AppRole; label: string; home: string }> = [
  { id: "farmer", label: "Farmer", home: "/farmer" },
  { id: "investor", label: "Investor", home: "/investor" },
  { id: "buyer", label: "Buyer", home: "/market" },
];

const ROLE_KEY = "agribridge_role";

export function isAppRole(value: unknown): value is AppRole {
  return value === "farmer" || value === "investor" || value === "buyer";
}

export function getStoredRole(): AppRole | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ROLE_KEY);
    return isAppRole(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeRole(role: AppRole) {
  try {
    window.localStorage.setItem(ROLE_KEY, role);
  } catch {
    // Private windows can refuse storage; the role then just is not remembered.
  }
}

/** The role last used, for pages every role shares (My stock, Activity). Starts at `fallback` until read. */
export function useRememberedRole(fallback: AppRole): AppRole {
  const [role, setRole] = useState<AppRole>(fallback);
  useEffect(() => {
    const stored = getStoredRole();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after hydration
    if (stored) setRole(stored);
  }, []);
  return role;
}

export function homeFor(role: AppRole | null | undefined): string {
  return APP_ROLES.find((r) => r.id === role)?.home ?? "/farmer";
}
