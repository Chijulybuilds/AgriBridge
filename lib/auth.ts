declare global {
  interface Window {
    ethereum?: import("ethers").Eip1193Provider;
  }
}

import { ethers } from "ethers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const SESSION_STORAGE_KEY = "agribridge_session";
const PROFILE_STORAGE_KEY = "agribridge_profile";

type StoredProfile = {
  id?: string;
  email?: string | null;
  display_name?: string | null;
  wallet_address?: string | null;
  role?: string | null;
};

function persistProfile(profile: StoredProfile | null) {
  if (typeof window === "undefined") return;

  if (!profile) {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function getStoredProfile(): StoredProfile | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredProfile;
  } catch {
    return null;
  }
}

export async function signUpWithBackend(email: string, password: string) {
  const res = await fetch(`${API_URL}/api/account/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Account creation failed");
  }

  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  return signUpWithBackend(email, password);
}

export async function signInWithEmail(email: string, password: string) {
  const res = await fetch(`${API_URL}/api/account/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Sign in failed");
  }

  return data;
}

export async function signInWithGoogle() {
  throw new Error(
    "MetaMask wallet authentication is enabled. Please use the MetaMask button.",
  );
}

export async function getSession() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(SESSION_STORAGE_KEY) || null;
}

export async function getAccessToken(): Promise<string | null> {
  return getSession();
}

export async function signOut() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  }
}

function clearStaleSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
}

export async function waitForSession(timeoutMs = 5000, intervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const token = await getSession();
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function parseJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function authedFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Not logged in. Please sign in with MetaMask first.");
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearStaleSession();
    }

    const message =
      (data && typeof data === "object" && "error" in data
        ? (data as { error?: string }).error
        : null) ||
      (data && typeof data === "object" && "message" in data
        ? (data as { message?: string }).message
        : null) ||
      `Request to ${path} failed (${res.status})`;
    throw new Error(message);
  }

  return data ?? {};
}

export async function getWalletNonce(wallet: string): Promise<string> {
  const data = await authedFetch("/api/wallet/nonce", {
    method: "POST",
    body: JSON.stringify({ wallet }),
  });
  if (!data?.message) {
    throw new Error("Wallet nonce response was empty.");
  }
  return data.message;
}

export async function signMessage(message: string): Promise<string> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not found. Please install MetaMask.");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return signer.signMessage(message);
}

export async function linkWallet(wallet: string, signature: string) {
  const data = await authedFetch("/api/wallet/link", {
    method: "POST",
    body: JSON.stringify({ wallet, signature }),
  });
  return data.profile;
}

export async function getWalletAuthNonce(wallet: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/account/wallet/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Unable to start wallet authentication");
  }

  return data.message;
}

export async function signInWithWallet(): Promise<{
  address: string;
  profile: { role?: string | null } | null;
  session: { access_token: string } | null;
}> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not found. Please install MetaMask.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  const address = accounts[0] as string;

  const message = await getWalletAuthNonce(address);
  const signer = await provider.getSigner();
  const signature = await signer.signMessage(message);

  const res = await fetch(`${API_URL}/api/account/wallet/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: address, signature }),
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearStaleSession();
    }

    const message =
      (data && typeof data === "object" && "error" in data
        ? (data as { error?: string }).error
        : null) || "Wallet authentication failed";
    throw new Error(message);
  }

  if (data?.session?.access_token) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, data.session.access_token);
    persistProfile(data.profile ?? null);
  }

  return {
    address,
    profile: data?.profile ?? null,
    session: data?.session ?? null,
  };
}

export async function signUpWithWallet() {
  return signInWithWallet();
}

export async function connectWallet(): Promise<{
  address: string;
  profile: StoredProfile | null;
  session: { access_token: string } | null;
}> {
  try {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask not found. Please install MetaMask.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    const address = accounts[0] as string;

    const existingSession = await getSession();
    if (!existingSession) {
      const authResult = await signInWithWallet();
      return {
        address: authResult.address,
        profile: authResult.profile,
        session: authResult.session,
      };
    }

    const message = await getWalletNonce(address);
    const signature = await signMessage(message);
    const profile = await linkWallet(address, signature);
    persistProfile(profile as StoredProfile | null);

    return { address, profile: profile as StoredProfile | null, session: null };
  } catch (err) {
    console.error("Wallet connect failed:", err);
    throw err;
  }
}

export async function getCurrentUser() {
  try {
    const data = await authedFetch("/api/account/me");
    if (data?.profile) {
      persistProfile(data.profile);
    }
    return data;
  } catch (error) {
    const fallbackProfile = getStoredProfile();
    if (fallbackProfile?.role) {
      return { profile: fallbackProfile, user: null };
    }
    throw error;
  }
}
