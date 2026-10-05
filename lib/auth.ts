/**
 * Session handling for wallet sign-in (Sign-In with Ethereum, EIP-4361).
 *
 * There is no backend, so the session lives in localStorage. It decides routing
 * and what the UI shows, but it is not an access-control boundary: every state
 * change is a transaction the wallet signs, and the contracts enforce roles
 * on-chain. Anything off-chain that needs protecting must verify the stored
 * SIWE signature on a server, not trust this session.
 */
import { verifyMessage, type Address, type Client, type Hex } from "viem";
import { verifyMessage as verifyMessageOnChain } from "viem/actions";
import {
  createSiweMessage,
  generateSiweNonce,
  parseSiweMessage,
  validateSiweMessage,
} from "viem/siwe";

const SESSION_STORAGE_KEY = "agribridge_session";
const PROFILE_STORAGE_KEY = "agribridge_profile";

/** How long a sign-in lasts before the wallet has to sign again. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type UserRole = "farmer" | "investor" | "admin";
export type SignupRole = Extract<UserRole, "farmer" | "investor">;

export type Profile = {
  id?: string;
  email?: string | null;
  display_name?: string | null;
  wallet_address: string;
  role: UserRole;
  /** The wallet holds the verifier role (or is the configured admin), so it may open the Verifier view. */
  canVerify?: boolean;
};

type Session = {
  profile: Profile;
  /** The signed SIWE message and its signature, kept so a server can re-verify them later. */
  message: string;
  signature: Hex;
  expiresAt: number;
};

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

/** Decodes the stored session, or returns null when it is missing, malformed or expired. */
function readSession(): Session | null {
  const token = getSessionToken();
  if (!token) return null;
  try {
    const session = JSON.parse(atob(token)) as Partial<Session>;
    if (
      !session.profile?.wallet_address ||
      !session.message ||
      !session.signature ||
      typeof session.expiresAt !== "number" ||
      Date.now() >= session.expiresAt
    ) {
      return null;
    }
    return session as Session;
  } catch {
    return null;
  }
}

/*//////////////////////////////////////////////////////////////
                    SIGN-IN WITH ETHEREUM (EIP-4361)
//////////////////////////////////////////////////////////////*/

/**
 * Builds the sign-in message the wallet signs.
 *
 * It must follow EIP-4361 exactly. Wallets such as MetaMask only treat a
 * message as a sign-in request (and check that the domain matches the site
 * asking) when it parses as SIWE; anything else is shown as an opaque text
 * signature. The statement must be a single line and no custom fields are
 * allowed, so the role is not part of the message.
 */
export function buildSiweMessage({ address, chainId }: { address: Address; chainId: number }): string {
  const issuedAt = new Date();
  return createSiweMessage({
    domain: window.location.host,
    address,
    statement: "Sign in to AgriBridge to prove you own this wallet. This is free and does not send a transaction.",
    uri: window.location.origin,
    version: "1",
    chainId,
    nonce: generateSiweNonce(),
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + SESSION_TTL_MS),
  });
}

/**
 * Confirms that `address` signed this sign-in message for this site.
 *
 * Ordinary wallets are checked locally by recovering the signer. Smart-contract
 * wallets, such as a Safe holding the verifier role, cannot be recovered that
 * way, so those fall back to an on-chain EIP-1271 check through `client`.
 */
export async function verifySiweSignature({
  message,
  signature,
  address,
  client,
}: {
  message: string;
  signature: Hex;
  address: Address;
  client?: Client;
}): Promise<boolean> {
  const fields = parseSiweMessage(message);
  if (!validateSiweMessage({ message: fields, address, domain: window.location.host })) {
    return false;
  }

  try {
    if (await verifyMessage({ address, message, signature })) return true;
  } catch {
    // Not a plain ECDSA signature; try the contract-wallet path below.
  }

  if (!client) return false;
  try {
    return await verifyMessageOnChain(client, { address, message, signature });
  } catch {
    return false;
  }
}

/** Packs a verified sign-in into the stored session token. Expiry comes from the signed message. */
export function createSessionToken({
  profile,
  message,
  signature,
}: {
  profile: Profile;
  message: string;
  signature: Hex;
}): string {
  const expiresAt =
    parseSiweMessage(message).expirationTime?.getTime() ?? Date.now() + SESSION_TTL_MS;
  const session: Session = { profile, message, signature, expiresAt };
  return btoa(JSON.stringify(session));
}

/*//////////////////////////////////////////////////////////////
                                ROLES
//////////////////////////////////////////////////////////////*/

/**
 * Optional override for the admin wallet. Without it, admin access comes from
 * holding VERIFIER_ROLE on the CommodityRegistry, which is what the contract
 * itself enforces.
 */
const ADMIN_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET?.toLowerCase();

export function isAdminWallet(wallet: string): boolean {
  return Boolean(ADMIN_WALLET) && wallet.toLowerCase() === ADMIN_WALLET;
}

/**
 * Switches the view (farmer, investor or verifier) of the signed-in wallet.
 *
 * Farmer and investor are not enforced on-chain (any wallet can deposit or
 * borrow), so no new signature is needed. The verifier view is only offered to
 * wallets that held the verifier role at sign-in, which lets one test wallet
 * walk through the whole demo; the contracts still check the role on every action.
 */
export function switchRole(role: UserRole): Profile | null {
  const session = readSession();
  if (!session) return null;
  if (role === "admin" && !session.profile.canVerify) return null;

  const profile: Profile = { ...session.profile, role };
  persistSession(btoa(JSON.stringify({ ...session, profile })), profile);
  return profile;
}

/** Returns the signed-in user's profile, or null once the session is missing or expired. */
export async function getCurrentUser(): Promise<{ profile: Profile } | null> {
  const session = readSession();
  if (!session) {
    // Never revive an expired or malformed session from the stored profile.
    clearSession();
    return null;
  }
  return { profile: session.profile };
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

/** Pages that need a signed-in session; see components/withAuth.tsx. */
export function isProtectedPath(pathname: string): boolean {
  return /^\/(farmer|investor|admin|activity)(\/|$)/.test(pathname);
}
