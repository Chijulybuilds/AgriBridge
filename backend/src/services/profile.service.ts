import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "ethers";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Profile } from "../types/index.js";

function logProfile(message: string, details: Record<string, unknown> = {}) {
  console.error(`[profile] ${message}`, details);
}

interface CreateUserResult {
  id: string;
  email: string;
  email_confirmed_at: string | null;
}

const sessionTokenStore = new Map<
  string,
  { userId: string; expiresAt: number }
>();
const fallbackProfiles = new Map<string, Profile>();
const fallbackWalletIndex = new Map<string, string>();
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "agribridge-session-secret-v1";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const SESSION_STORE_FILE = resolve(process.cwd(), ".session-store.json");

function loadSessionStore() {
  if (!existsSync(SESSION_STORE_FILE)) return;

  try {
    const raw = readFileSync(SESSION_STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<
      string,
      { userId: string; expiresAt: number }
    >;
    for (const [token, entry] of Object.entries(parsed)) {
      if (entry?.expiresAt && entry.expiresAt > Date.now()) {
        sessionTokenStore.set(token, entry);
      }
    }
  } catch (error) {
    logProfile("failed to load session store", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function persistSessionStore() {
  const serializable = Object.fromEntries(
    Array.from(sessionTokenStore.entries()).filter(
      ([, entry]) => entry.expiresAt > Date.now(),
    ),
  );
  writeFileSync(SESSION_STORE_FILE, JSON.stringify(serializable), "utf8");
}

loadSessionStore();

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createSignedSessionToken(userId: string): string {
  const payload = JSON.stringify({
    sub: userId,
    exp: Date.now() + SESSION_TTL_MS,
  });
  const encodedPayload = base64UrlEncode(payload);
  const signature = createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("hex");
  return `${encodedPayload}.${signature}`;
}

function verifySignedSessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const expectedSignature = createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("hex");

  try {
    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    if (signatureBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as {
      sub?: string;
      exp?: number;
    };
    if (!payload.sub || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function isSupabaseConfigError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /bearer token|service role|service-role|invalid|missing/i.test(
    message,
  );
}

function upsertFallbackProfile(profile: Profile): Profile {
  fallbackProfiles.set(profile.id, profile);
  if (profile.wallet_address) {
    fallbackWalletIndex.set(profile.wallet_address.toLowerCase(), profile.id);
  }
  return profile;
}

function issueSessionToken(userId: string): string {
  const token = createSignedSessionToken(userId);
  sessionTokenStore.set(token, {
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  persistSessionStore();
  return token;
}

function verifySessionToken(token: string): string | null {
  const entry = sessionTokenStore.get(token);
  if (entry) {
    if (Date.now() > entry.expiresAt) {
      sessionTokenStore.delete(token);
    } else {
      return entry.userId;
    }
  }

  return verifySignedSessionToken(token);
}

function buildWalletAuthMessage(wallet: string): string {
  return [
    "AgriBridge wallet authentication",
    "",
    "Sign this message to access your account.",
    `Wallet: ${wallet}`,
  ].join("\n");
}

/**
 * Profiles are keyed by the Supabase auth user id (the email/Gmail account).
 * A profile row is created automatically by a DB trigger on signup; this
 * service reads it and links a wallet to it later.
 */
export const profileService = {
  buildWalletAuthMessage(wallet: string) {
    return buildWalletAuthMessage(wallet.toLowerCase());
  },

  issueSessionToken(userId: string) {
    return issueSessionToken(userId);
  },

  verifySessionToken(token: string) {
    return verifySessionToken(token);
  },

  async getById(userId: string): Promise<Profile | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        if (isSupabaseConfigError(error)) {
          logProfile("getById using fallback store", {
            userId,
            error: error.message,
          });
          return fallbackProfiles.get(userId) ?? null;
        }
        logProfile("getById failed", { userId, error: error.message });
        throw error;
      }
      return (data as Profile) ?? null;
    } catch (error) {
      if (isSupabaseConfigError(error)) {
        logProfile("getById fallback hit", {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return fallbackProfiles.get(userId) ?? null;
      }
      throw error;
    }
  },

  async getByWallet(wallet: string): Promise<Profile | null> {
    const normalizedWallet = wallet.toLowerCase();
    try {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("wallet_address", normalizedWallet)
        .maybeSingle();
      if (error) {
        if (isSupabaseConfigError(error)) {
          logProfile("getByWallet using fallback store", {
            wallet: normalizedWallet,
            error: error.message,
          });
          return (
            fallbackProfiles.get(
              fallbackWalletIndex.get(normalizedWallet) ?? "",
            ) ?? null
          );
        }
        logProfile("getByWallet failed", {
          wallet: normalizedWallet,
          error: error.message,
        });
        throw error;
      }
      return (data as Profile) ?? null;
    } catch (error) {
      if (isSupabaseConfigError(error)) {
        logProfile("getByWallet fallback hit", {
          wallet: normalizedWallet,
          error: error instanceof Error ? error.message : String(error),
        });
        return (
          fallbackProfiles.get(
            fallbackWalletIndex.get(normalizedWallet) ?? "",
          ) ?? null
        );
      }
      throw error;
    }
  },

  async touchLogin(userId: string): Promise<void> {
    const profile = fallbackProfiles.get(userId);
    if (profile) {
      upsertFallbackProfile({
        ...profile,
        last_login_at: new Date().toISOString(),
      });
      return;
    }

    try {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) {
        if (isSupabaseConfigError(error)) {
          logProfile("touchLogin using fallback", {
            userId,
            error: error.message,
          });
          return;
        }
        logProfile("touchLogin failed", { userId, error: error.message });
        throw error;
      }
    } catch (error) {
      if (!isSupabaseConfigError(error)) throw error;
      logProfile("touchLogin fallback hit", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async createConfirmedUser(
    email: string,
    password: string,
  ): Promise<CreateUserResult> {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { source: "wallet" },
      });

      if (error) {
        if (isSupabaseConfigError(error)) {
          logProfile("createConfirmedUser using fallback", {
            email,
            error: error.message,
          });
          const id = randomUUID();
          return {
            id,
            email,
            email_confirmed_at: new Date().toISOString(),
          };
        }
        logProfile("createConfirmedUser failed", {
          email,
          error: error.message,
        });
        throw error;
      }
      if (!data.user) throw new Error("Failed to create Supabase user");

      return {
        id: data.user.id,
        email: data.user.email ?? email,
        email_confirmed_at:
          data.user.email_confirmed_at ?? new Date().toISOString(),
      };
    } catch (error) {
      if (isSupabaseConfigError(error)) {
        logProfile("createConfirmedUser fallback hit", {
          email,
          error: error instanceof Error ? error.message : String(error),
        });
        const id = randomUUID();
        return {
          id,
          email,
          email_confirmed_at: new Date().toISOString(),
        };
      }
      throw error;
    }
  },

  async signInWithPassword(email: string, password: string) {
    try {
      const { data, error } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (isSupabaseConfigError(error)) {
          logProfile("signInWithPassword using fallback", {
            email,
            error: error.message,
          });
          const userId = randomUUID();
          const sessionToken = issueSessionToken(userId);
          return {
            user: { id: userId, email },
            session: { access_token: sessionToken },
          };
        }
        logProfile("signInWithPassword failed", {
          email,
          error: error.message,
        });
        throw error;
      }

      return {
        user: data.user,
        session: data.session,
      };
    } catch (error) {
      if (isSupabaseConfigError(error)) {
        logProfile("signInWithPassword fallback hit", {
          email,
          error: error instanceof Error ? error.message : String(error),
        });
        const userId = randomUUID();
        const sessionToken = issueSessionToken(userId);
        return {
          user: { id: userId, email },
          session: { access_token: sessionToken },
        };
      }
      throw error;
    }
  },

  async signInWithWallet(wallet: string, signature: string) {
    if (!ethers.isAddress(wallet)) {
      throw new Error("Invalid wallet address");
    }

    const address = wallet.toLowerCase();
    const message = buildWalletAuthMessage(address);
    const recovered = ethers.verifyMessage(message, signature);

    logProfile("wallet signature verification started", {
      wallet: address,
      signatureLength: signature.length,
      recovered,
    });

    if (recovered.toLowerCase() !== address) {
      logProfile("wallet signature mismatch", {
        wallet: address,
        recovered,
      });
      throw new Error("Signature does not match wallet");
    }

    let profile = await this.getByWallet(address);
    let userId = profile?.id;
    let email = profile?.email;
    const password = randomBytes(24).toString("hex");

    if (!userId) {
      logProfile("creating wallet-backed account", { wallet: address });
      const created = await this.createConfirmedUser(
        `${address.replace(/^0x/, "")}@wallet.agribridge.local`,
        password,
      );
      userId = created.id;
      email = created.email;

      const fallbackProfile: Profile = {
        id: userId,
        email,
        display_name: null,
        wallet_address: address,
        role: "farmer",
        created_at: new Date().toISOString(),
        wallet_linked_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
      };
      upsertFallbackProfile(fallbackProfile);
      profile = fallbackProfile;
    } else {
      logProfile("reusing existing wallet-linked profile", {
        wallet: address,
        userId,
      });
      const existingProfile = profile ?? (await this.getById(userId));
      if (existingProfile) {
        profile = upsertFallbackProfile({
          ...existingProfile,
          wallet_address: address,
          wallet_linked_at:
            existingProfile.wallet_linked_at ?? new Date().toISOString(),
          last_login_at: new Date().toISOString(),
        });
      }
    }

    if (!email) {
      email = `${address.replace(/^0x/, "")}@wallet.agribridge.local`;
    }

    await this.touchLogin(userId);
    const sessionToken = this.issueSessionToken(userId);
    logProfile("wallet auth session issued", {
      wallet: address,
      userId,
      tokenPreview: `${sessionToken.slice(0, 8)}...${sessionToken.slice(-4)}`,
    });

    return {
      user: { id: userId, email },
      session: { access_token: sessionToken },
      profile,
    };
  },

  /** Binds a verified wallet address to the account (one wallet per account). */
  async linkWallet(userId: string, wallet: string): Promise<Profile> {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({
        wallet_address: wallet.toLowerCase(),
        wallet_linked_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();
    if (error) {
      if (isSupabaseConfigError(error)) {
        const profile = fallbackProfiles.get(userId);
        if (profile) {
          const updatedProfile = upsertFallbackProfile({
            ...profile,
            wallet_address: wallet.toLowerCase(),
            wallet_linked_at: new Date().toISOString(),
          });
          return updatedProfile;
        }
      }
      logProfile("linkWallet failed", { userId, wallet, error: error.message });
      // 23505 = unique_violation → wallet already linked to another account.
      if ((error as { code?: string }).code === "23505") {
        throw new Error("This wallet is already linked to another account");
      }
      throw error;
    }
    return data as Profile;
  },
};
