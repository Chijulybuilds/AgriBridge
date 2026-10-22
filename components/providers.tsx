import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { queryClient } from "../lib/queryClient";
import { appConfig, verifierConfig, web3AuthClientId } from "../lib/wagmi";

/** The MetaMask Embedded Wallets SDK only runs in the browser, so it is never server-rendered. */
const EmbeddedWalletProviders = dynamic(() => import("./EmbeddedWalletProviders"), {
  ssr: false,
  loading: () => <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }} />,
});

/** Whether the public app signs people in with Google, email or phone (MetaMask Embedded Wallets). */
export const usesEmbeddedWallets = Boolean(web3AuthClientId);

/**
 * Wallets for the public app: Google, email or phone sign-in when a client ID is set (MetaMask
 * still on offer), otherwise MetaMask in the browser; the test wallet in the end-to-end tests.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  if (usesEmbeddedWallets) return <EmbeddedWalletProviders>{children}</EmbeddedWalletProviders>;
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
