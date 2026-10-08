import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { Fraunces, JetBrains_Mono, Manrope } from "next/font/google";

import "../styles/globals.css";

import { AppProviders, VerifierProviders } from "../components/providers";
import { ThemeProvider } from "../lib/theme";

/** Fraunces for headings (the farm), Manrope for everything else (the ledger), a mono for addresses. */
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

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
      <Head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={`app-root ${display.variable} ${sans.variable} ${mono.variable}`}>
        <Providers>
          <Component {...pageProps} />
        </Providers>
      </div>
    </ThemeProvider>
  );
}
