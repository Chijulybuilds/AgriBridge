import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { queryClient } from "../lib/queryClient";
import { appConfig, verifierConfig } from "../lib/wagmi";

/** Wallets for the public app: MetaMask in the browser (and the test wallet in the end-to-end tests). */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={appConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

/** Wallets for /verifier: the Safe, opened as a Safe App, and nothing from the public sign-in. */
export function VerifierProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={verifierConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
