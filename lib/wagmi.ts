import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia, foundry } from "wagmi/chains";
import { http } from "wagmi";

/**
 * Wagmi + RainbowKit configuration.
 *
 * Sepolia is the deployment target. The local Foundry chain is included so the
 * app can be driven against `anvil` during development and end-to-end tests
 * without touching a public network.
 */
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);

/**
 * WalletConnect requires a project id. Without one RainbowKit still renders and
 * injected wallets such as MetaMask work; only the QR-code flow is unavailable.
 */
const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "agribridge_local_dev";

export const activeChain = chainId === foundry.id ? foundry : sepolia;

export const wagmiConfig = getDefaultConfig({
  appName: "AgriBridge",
  projectId: walletConnectProjectId,
  chains: [activeChain],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
    [foundry.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"),
  },
  ssr: true,
});
