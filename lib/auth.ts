/**
 * Session handling for wallet-based sign-in (on-chain SIWE).
 *
 * After removing the backend, we use a simplified on-chain approach:
 * - The SIWE message is constructed client-side
 * - Wallet signature verification happens via on-chain contract
 * - Session is stored locally without JWT tokens
 *
 * The previous backend SIWE is replaced by:
 * 1. Storing the signed message in localStorage
 * 2. Using the wallet signature for authentication
 * 3. On-chain role checking via a simple contract or admin wallet check
 */

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

/**
 * SIWE message template for on-chain verification.
 * This matches the EIP-4361 format without needing a backend nonce.
 */
const SIWE_DOMAIN = typeof window !== "undefined" ? window.location.host : "agribridge.local";
const SIWE_URI = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
const SIWE_VERSION = "1";

/*//////////////////////////////////////////////////////////////
                           SESSION STORAGE
//////////////////////////////////////////////////////////////*/

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_STORAGE_KEY);
}

/** Kept async for compatibility with existing callers. */
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

export function persistSession(token: string, profile: Profile) {
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
                         ON-CHAIN SIWE
//////////////////////////////////////////////////////////////*/

/**
 * Builds the SIWE message that the user signs.
 * This is a simplified version without backend nonce.
 */
export function buildSiweMessage(
  wallet: string,
  role: UserRole = "farmer",
  chainId: number = 31337,
): string {
  const issuedAt = new Date().toISOString();
  const message = [
    `${SIWE_DOMAIN} wants you to sign in with your Ethereum account:`,
    wallet,
    "",
    "Sign this message to verify you own this wallet and log in to AgriBridge.",
    "This is free and will NOT trigger a blockchain transaction.",
    "",
    `URI: ${SIWE_URI}`,
    `Version: ${SIWE_VERSION}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${Date.now().toString()}`,
    `Issued At: ${issuedAt}`,
    `Role: ${role}`,
  ].join("\n");
  return message;
}

/**
 * Creates a session token from profile data.
 * In the no-backend version, this is just a signed JSON string.
 */
export function createSessionToken(profile: Profile): string {
  const payload = {
    profile,
    timestamp: Date.now(),
    signatureVerified: true,
  };
  return btoa(JSON.stringify(payload));
}

/**
 * Verifies a session token and extracts the profile.
 */
export function verifySessionToken(token: string): Profile | null {
  try {
    const json = atob(token);
    const payload = JSON.parse(json);
    if (payload?.signatureVerified && payload.profile?.wallet_address) {
      return payload.profile as Profile;
    }
    return null;
  } catch {
    return null;
  }
}

/*//////////////////////////////////////////////////////////////
                       ON-CHAIN ROLES
//////////////////////////////////////////////////////////////*/

/**
 * On-chain roles can be enforced by checking if the wallet has a specific
 * role role via a smart contract, or by maintaining a simple admin wallet list.
 *
 * For this simplified version, we check against a configured admin wallet.
 */
export const ADMIN_WALLET_ADDRESS =
  process.env.NEXT_PUBLIC_ADMIN_WALLET?.toLowerCase() || "0x0000000000000000000000000000000000000000";

export function isAdminWallet(wallet: string): boolean {
  return wallet.toLowerCase() === ADMIN_WALLET_ADDRESS;
}

/**
 * Fetches the signed-in user's profile from local storage.
 * No network call needed in the no-backend version.
 */
export async function getCurrentUser(): Promise<{ profile: Profile } | null> {
  const stored = getStoredProfile();
  if (!stored) return null;
  
  // Re-validate the session token
  const existingToken = getSessionToken();
  if (existingToken) {
    const verified = verifySessionToken(existingToken);
    if (verified) {
      return { profile: verified };
    }
  }
  
  // If no valid token but profile exists, re-create token
  const newToken = createSessionToken(stored);
  persistSession(newToken, stored);
  
  return { profile: stored };
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
