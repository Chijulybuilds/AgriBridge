import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { WagmiProvider, useConfig } from "wagmi";
import { watchAccount } from "wagmi/actions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";

import "@rainbow-me/rainbowkit/styles.css";
import "../styles/globals.css";

import { wagmiConfig } from "../lib/wagmi";
import { ThemeProvider } from "../lib/theme";
import {
  clearSession,
  getCurrentUser,
  getSessionToken,
  getStoredProfile,
  isProtectedPath,
  type Profile,
} from "../lib/auth";

interface AuthContextType {
  profile: Profile | null;
  loading: boolean;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: Profile | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  signOut: () => {},
  refreshProfile: async () => {},
  setProfile: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Chain reads go stale quickly; refetching on focus keeps balances honest.
      staleTime: 10_000,
      retry: 1,
    },
  },
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  // Seed from the stored profile so a reload does not flash the signed-out UI
  // before the profile request comes back.
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      const result = await getCurrentUser();
      setProfile(result?.profile ?? null);
    } catch {
      // A rejected token has already been cleared by authedFetch.
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const token = getSessionToken();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setProfile(getStoredProfile());
      await refreshProfile();
      if (!cancelled) setLoading(false);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshProfile]);

  const signOut = useCallback(() => {
    clearSession();
    setProfile(null);
    window.location.href = "/";
  }, []);

  const router = useRouter();
  const config = useConfig();

  // A session belongs to the wallet that signed it. End it when the wallet
  // switches to another account or disconnects, so one wallet's dashboard is
  // never shown while a different one signs the transactions.
  useEffect(
    () =>
      watchAccount(config, {
        onChange(account, previous) {
          const signedIn = getStoredProfile();
          if (!signedIn) return;

          const switched =
            account.status === "connected" &&
            account.address.toLowerCase() !== signedIn.wallet_address.toLowerCase();
          const disconnected = previous.status === "connected" && account.status === "disconnected";
          if (!switched && !disconnected) return;

          clearSession();
          setProfile(null);
          if (isProtectedPath(router.pathname)) void router.replace("/login");
        },
      }),
    [config, router],
  );

  return (
    <AuthContext.Provider
      value={{ profile, loading, signOut, refreshProfile, setProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#2f9e44",
            accentColorForeground: "white",
            borderRadius: "medium",
          })}
        >
          <ThemeProvider>
            <AuthProvider>
              <Component {...pageProps} />
            </AuthProvider>
          </ThemeProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
