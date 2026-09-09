import { useCallback, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

import {
  requestLoginMessage,
  submitLoginSignature,
  type Profile,
  type SignupRole,
} from "../lib/auth";

/**
 * Drives Sign-In with Ethereum against the connected wallet.
 *
 * The wallet itself is connected through RainbowKit; this hook covers the
 * exchange that turns a connected address into a backend session: fetch the
 * nonce-bearing message, sign it, and trade the signature for a token.
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
        const message = await requestLoginMessage(address);
        const signature = await signMessageAsync({ message });
        const { profile } = await submitLoginSignature(address, signature, role);
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
