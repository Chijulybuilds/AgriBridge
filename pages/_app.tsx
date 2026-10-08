import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { Atkinson_Hyperlegible_Next, Big_Shoulders, Big_Shoulders_Stencil } from "next/font/google";
import { LazyMotion, MotionConfig, domMax } from "motion/react";

import "../styles/globals.css";

import { AppProviders, VerifierProviders } from "../components/providers";
import { ThemeProvider } from "../lib/theme";

/**
 * Big Shoulders, the condensed face of warehouse signage, for page titles and figures;
 * its stencil cut only for lot codes; Atkinson Hyperlegible Next, drawn for legibility,
 * for everything people read.
 */
// next/font has no fallback metrics for these newer families, so the fallbacks are named here instead.
const display = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Arial Narrow", "sans-serif"],
});
const stencil = Big_Shoulders_Stencil({
  subsets: ["latin"],
  variable: "--font-stencil",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Arial Narrow", "sans-serif"],
});
const sans = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

/**
 * Motion (motion.dev) runs the few animations CSS can't: indicators that slide between tabs, and
 * exits. One spring for all of them, with no bounce, matching --ease-out in globals.css; it
 * switches itself off when the person has asked for reduced motion.
 */
const SPRING = { type: "spring", duration: 0.32, bounce: 0 } as const;

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
      <MotionConfig reducedMotion="user" transition={SPRING}>
      <LazyMotion features={domMax} strict>
      <Head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={`app-root ${display.variable} ${stencil.variable} ${sans.variable}`}>
        <Providers>
          <Component {...pageProps} />
        </Providers>
      </div>
      </LazyMotion>
      </MotionConfig>
    </ThemeProvider>
  );
}
