import type { AppProps } from "next/app";
import "../styles/globals.css";
import { createContext, useContext, useEffect, useState } from "react";
import {
  signOut as clearSession,
  getCurrentUser,
  getSession,
} from "../lib/auth";

interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  wallet_address: string | null;
  role: string;
}

interface AuthContextType {
  profile: Profile | null;
  loading: boolean;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  signOut: () => {},
  refreshProfile: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function App({ Component, pageProps }: AppProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshProfile() {
    try {
      const { profile } = await getCurrentUser();
      setProfile(profile);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    async function bootstrap() {
      const token = await getSession();
      if (token) {
        await refreshProfile();
      }
      setLoading(false);
    }

    void bootstrap();
  }, []);

  const signOut = async () => {
    await clearSession();
    setProfile(null);
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ profile, loading, signOut, refreshProfile }}>
      <Component {...pageProps} />
    </AuthContext.Provider>
  );
}
