/**
 * Session handling for wallet-based sign-in.
 *
 * Wallet connection and message signing are handled by RainbowKit and Wagmi
 * (see lib/wagmi.ts and hooks/useSiweLogin.ts). This module owns only the
 * backend half: exchanging a signature for a session token, storing it, and
 * attaching it to API requests.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const SESSION_STORAGE_KEY = "agribridge_session";
const PROFILE_STORAGE_KEY = "agribridge_profile";

export type UserRole = "farmer" | "investor" | "admin";
export type SignupRole = Extract<UserRole, "farmer" | "investor">;

export type Profile = {
  id?: string;
  email?: string | null;
  display_name?: string | null;
  wallet_address: string;
  role: UserRole;
};

/*//////////////////////////////////////////////////////////////
                          SESSION STORAGE
//////////////////////////////////////////////////////////////*/

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_STORAGE_KEY);
}

/** Kept async because callers await it, and it once hit the network. */
export async function getSession(): Promise<string | null> {
  return getSessionToken();
}

export function getStoredProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

function persistSession(token: string, profile: Profile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, token);
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
}

export async function signOut() {
  clearSession();
}

/*//////////////////////////////////////////////////////////////
                            HTTP HELPERS
//////////////////////////////////////////////////////////////*/

async function parseJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function errorFrom(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return fallback;
}

/** Unauthenticated request to the backend. */
export async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(errorFrom(data, `Request to ${path} failed (${res.status})`));
  return data ?? {};
}

/**
 * Authenticated request. A 401 or 403 means the session is no longer usable, so
 * it is cleared rather than left behind to fail every subsequent call.
 */
export async function authedFetch(path: string, options: RequestInit = {}) {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in. Connect your wallet to continue.");

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await parseJson(res);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) clearSession();
    throw new Error(errorFrom(data, `Request to ${path} failed (${res.status})`));
  }
  return data ?? {};
}

/*//////////////////////////////////////////////////////////////
                        SIGN-IN WITH ETHEREUM
//////////////////////////////////////////////////////////////*/

/**
 * Step 1: ask the backend for the exact message to sign.
 * The message carries a one-time nonce and is bound to this app's domain.
 */
export async function requestLoginMessage(wallet: string): Promise<string> {
  const data = await apiFetch("/api/account/wallet/nonce", {
    method: "POST",
    body: JSON.stringify({ wallet }),
  });
  if (!data?.message) throw new Error("Backend returned no message to sign.");
  return data.message as string;
}

/**
 * Step 2: exchange the signature for a session.
 *
 * @param role Applied only when this wallet has never signed in before.
 */
export async function submitLoginSignature(
  wallet: string,
  signature: string,
  role?: SignupRole,
): Promise<{ token: string; profile: Profile }> {
  const data = await apiFetch("/api/account/wallet/auth", {
    method: "POST",
    body: JSON.stringify({ wallet, signature, role }),
  });

  const token = data?.session?.access_token as string | undefined;
  const profile = data?.profile as Profile | undefined;
  if (!token || !profile) throw new Error("Sign-in did not return a session.");

  persistSession(token, profile);
  return { token, profile };
}

/** Fetches the signed-in user's profile, refreshing what is stored locally. */
export async function getCurrentUser(): Promise<{ profile: Profile } | null> {
  const data = await authedFetch("/api/account/me");
  const profile = data?.profile as Profile | undefined;
  if (!profile) return null;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }
  return { profile };
}

/** Landing page for a role. Used after sign-in and by the route guards. */
export function dashboardPathFor(role: UserRole | string | null | undefined): string {
  switch (role) {
    case "admin":
      return "/admin/dashboard";
    case "investor":
      return "/investor/dashboard";
    case "farmer":
      return "/farmer/dashboard";
    default:
      return "/login";
  }
}
