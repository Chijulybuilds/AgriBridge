import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AUTH_CONNECTION, CHAIN_NAMESPACES, WALLET_CONNECTORS, WEB3AUTH_NETWORK } from "@web3auth/modal";
import { Web3AuthProvider, type Web3AuthContextConfig } from "@web3auth/modal/react";
import { WagmiProvider } from "@web3auth/modal/react/wagmi";

import { queryClient } from "../lib/queryClient";
import { activeChain, rpcUrl, web3AuthClientId, web3AuthNetwork } from "../lib/wagmi";

/** Social sign-ins the window does not offer: only Google, email and a phone number are shown. */
const HIDDEN_LOGINS = [
  AUTH_CONNECTION.TWITTER,
  AUTH_CONNECTION.FACEBOOK,
  AUTH_CONNECTION.DISCORD,
  AUTH_CONNECTION.FARCASTER,
  AUTH_CONNECTION.APPLE,
  AUTH_CONNECTION.GITHUB,
  AUTH_CONNECTION.REDDIT,
  AUTH_CONNECTION.LINE,
  AUTH_CONNECTION.KAKAO,
  AUTH_CONNECTION.LINKEDIN,
  AUTH_CONNECTION.TWITCH,
  AUTH_CONNECTION.TELEGRAM,
  AUTH_CONNECTION.WECHAT,
];

const chainIdHex = `0x${activeChain.id.toString(16)}`;

const config: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId: web3AuthClientId ?? "",
    web3AuthNetwork: web3AuthNetwork === "sapphire_mainnet" ? WEB3AUTH_NETWORK.SAPPHIRE_MAINNET : WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    // The wallets live on the same network as the app: Sepolia, or the local chain in development.
    chains: [
      {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: chainIdHex,
        rpcTarget: rpcUrl ?? activeChain.rpcUrls.default.http[0],
        displayName: activeChain.name,
        blockExplorerUrl: activeChain.blockExplorers?.default.url ?? "",
        ticker: "ETH",
        tickerName: "Ethereum",
        logo: "https://images.toruslabs.com/js/ethereum.svg",
      },
    ],
    defaultChainId: chainIdHex,
    uiConfig: {
      appName: "AgriBridge",
      mode: "auto",
      loginMethodsOrder: [AUTH_CONNECTION.GOOGLE, AUTH_CONNECTION.EMAIL_PASSWORDLESS, AUTH_CONNECTION.SMS_PASSWORDLESS],
      primaryButton: "socialLogin",
    },
    modalConfig: {
      connectors: {
        [WALLET_CONNECTORS.AUTH]: {
          label: "auth",
          loginMethods: {
            [AUTH_CONNECTION.GOOGLE]: { name: "Google", mainOption: true },
            [AUTH_CONNECTION.EMAIL_PASSWORDLESS]: { name: "Email", showOnModal: true },
            [AUTH_CONNECTION.SMS_PASSWORDLESS]: { name: "Phone number", showOnModal: true },
            ...Object.fromEntries(HIDDEN_LOGINS.map((login) => [login, { showOnModal: false }])),
          },
        },
      },
    },
  },
};

/**
 * Sign-in with MetaMask Embedded Wallets: Google, email or a phone number. The first sign-in
 * creates the person's wallet, already connected; signing in again on any device brings the same
 * wallet back. The key is split between the person's login, their device and MetaMask's key
 * network, so AgriBridge never holds it. People who use MetaMask can still choose it.
 *
 * The allowed website addresses are set in the dashboard for this client ID. Loaded only in the
 * browser (see components/providers.tsx): the SDK has no server-side mode.
 */
export default function EmbeddedWalletProviders({ children }: { children: ReactNode }) {
  return (
    <Web3AuthProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider>{children}</WagmiProvider>
      </QueryClientProvider>
    </Web3AuthProvider>
  );
}
