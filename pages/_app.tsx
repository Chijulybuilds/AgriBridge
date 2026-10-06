import type { AppProps } from "next/app";
import { useRouter } from "next/router";

import "../styles/globals.css";

import { AppProviders, VerifierProviders } from "../components/providers";
import { ThemeProvider } from "../lib/theme";

/**
 * Two separate wallet setups: the hidden /verifier page talks only to the
 * verifier Safe; every other page signs people in with MetaMask Embedded
 * Wallets (or a browser wallet in local development). See components/providers.tsx.
 */
export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const Providers = router.pathname.startsWith("/verifier") ? VerifierProviders : AppProviders;
  return (
    <ThemeProvider>
      <Providers>
        <Component {...pageProps} />
      </Providers>
    </ThemeProvider>
  );
}
