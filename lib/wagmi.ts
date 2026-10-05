import { getDefaultConfig, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { sepolia, foundry } from "wagmi/chains";
import { http } from "wagmi";

import { demoWalletGroup } from "./demo";

/**
 * Wagmi + RainbowKit configuration.
 *
 * Sepolia is the deployment target. The local Foundry chain is included so the
 * app can be driven against `anvil` during development and end-to-end tests
 * without touching a public network.
 *
 * Injected wallets (MetaMask, etc.) work without a WalletConnect project ID.
 * Only the QR-code walletconnect flow requires one. We use a try/catch so the
 * build succeeds even when the project ID is missing or invalid.
 */
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);

export const activeChain = chainId === foundry.id ? foundry : sepolia;

const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL || (activeChain.id === foundry.id ? "http://127.0.0.1:8545" : undefined);

/** Get or define a valid fallback so the build does not crash. */
const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";

// Demo accounts (when configured) come first in the Connect Wallet modal.
const { wallets: defaultWallets } = getDefaultWallets();

export const wagmiConfig = getDefaultConfig({
  appName: "AgriBridge",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [activeChain],
  wallets: [...demoWalletGroup(activeChain, rpcUrl), ...defaultWallets],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
    [foundry.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"),
  },
  ssr: true,
});
