import { useCallback, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { type Address } from "viem";

import {
  buildSiweMessage,
  createSessionToken,
  getStoredProfile,
  persistSession,
  type Profile,
  type SignupRole,
  ADMIN_WALLET_ADDRESS,
} from "../lib/auth";

/**
 * Drives Sign-In with Ethereum against the connected wallet.
 *
 * In the no-backend version:
 * 1. Build the SIWE message client-side
 * 2. Sign it with the wallet
 * 3. Store the session token locally
 * 4. Determine role based on admin wallet check or default to user role
 */
export function useSiweLogin() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    async (role?: SignupRole): Promise<Profile | null> => {
      if (!isConnected || !address) {
        setError("Connect a wallet first.");
        return null;
      }

      setIsSigningIn(true);
      setError(null);

      try {
        // Determine the role - admin if it's the admin wallet, otherwise user role
        const wallet = address as Address;
        const determinedRole = isAdminWallet(wallet) ? ("admin" as const) : ((role as SignupRole) ?? "farmer");

        // Build and sign the SIWE message
        const message = buildSiweMessage(wallet, determinedRole);
        const signature = await signMessageAsync({ message });

        // Create profile and session
        const profile: Profile = {
          wallet_address: wallet,
          role: determinedRole,
        };

        const token = createSessionToken(profile);
        persistSession(token, profile);

        return profile;
      } catch (err) {
        // A user declining the signature prompt is a normal outcome, not a fault.
        const raw = err instanceof Error ? err.message : "Sign-in failed";
        const rejected =
          raw.toLowerCase().includes("user rejected") ||
          raw.toLowerCase().includes("user denied");
        setError(rejected ? "Signature request was declined." : raw);
        return null;
      } finally {
        setIsSigningIn(false);
      }
    },
    [address, isConnected, signMessageAsync],
  );

  return { signIn, isSigningIn, error, address, isConnected };
}

/**
 * Checks if the given wallet address is the admin wallet.
 */
function isAdminWallet(wallet: string): boolean {
  const admin = process.env.NEXT_PUBLIC_ADMIN_WALLET?.toLowerCase() || ADMIN_WALLET_ADDRESS;
  return wallet.toLowerCase() === admin;
}
