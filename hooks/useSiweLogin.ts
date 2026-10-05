import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useSignMessage } from "wagmi";
import { type Address } from "viem";

import { CommodityRegistryAbi } from "../lib/contracts/abis";
import { contracts, VERIFIER_ROLE } from "../lib/contracts/config";
import { activeChain } from "../lib/wagmi";
import {
  buildSiweMessage,
  createSessionToken,
  isAdminWallet,
  persistSession,
  verifySiweSignature,
  type Profile,
  type SignupRole,
} from "../lib/auth";

/**
 * Drives Sign-In with Ethereum against the connected wallet.
 *
 * 1. Build a standard EIP-4361 message for this site and the app's chain
 * 2. Have the wallet sign it, then verify the signature
 * 3. Work out the role: admin for the configured admin wallet or any wallet
 *    holding VERIFIER_ROLE on-chain, otherwise the role the user picked
 * 4. Store the session locally (see lib/auth.ts for what that does and does not protect)
 */
export function useSiweLogin() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
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
        // The app's chain, not whatever network the wallet is on: it is where
        // contract wallets are checked and where the session's roles live.
        const message = buildSiweMessage({ address, chainId: activeChain.id });
        const signature = await signMessageAsync({ message });

        const valid = await verifySiweSignature({ message, signature, address, client: publicClient });
        if (!valid) {
          setError("The signature could not be verified for this wallet. Try again.");
          return null;
        }

        const admin = isAdminWallet(address) || (await holdsVerifierRole(publicClient, address));
        const profile: Profile = {
          wallet_address: address,
          role: admin ? "admin" : (role ?? "farmer"),
        };

        persistSession(createSessionToken({ profile, message, signature }), profile);
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
    [address, isConnected, publicClient, signMessageAsync],
  );

  return { signIn, isSigningIn, error, address, isConnected };
}

/** Whether the wallet may verify commodities, read from the registry the contract checks. */
async function holdsVerifierRole(
  client: ReturnType<typeof usePublicClient>,
  wallet: Address,
): Promise<boolean> {
  if (!client || !contracts.registry) return false;
  try {
    return await client.readContract({
      address: contracts.registry,
      abi: CommodityRegistryAbi,
      functionName: "hasRole",
      args: [VERIFIER_ROLE, wallet],
    });
  } catch {
    // An unreachable RPC should not block sign-in; the queue re-checks the role.
    return false;
  }
}
