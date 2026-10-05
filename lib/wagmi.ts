import { getDefaultConfig, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { metaMaskWallet } from "@rainbow-me/rainbowkit/wallets";
import { sepolia, foundry } from "wagmi/chains";
import { createConnector, http } from "wagmi";
import { injected } from "wagmi/connectors";

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

/** Get or define a valid fallback so the build does not crash. */
const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";

/**
 * MetaMask through the extension's own injected provider.
 *
 * RainbowKit's default MetaMask entry connects through the MetaMask SDK, which
 * can sit on "Opening MetaMask… Confirm connection in the extension" without
 * the extension ever showing a request. Talking to the extension's provider
 * directly is the standard path and connects straight away.
 */
const metaMaskExtensionWallet: typeof metaMaskWallet = (options) => ({
  ...metaMaskWallet(options),
  // Without the extension there is nothing to talk to: offer the download rather than a QR code.
  mobile: undefined,
  qrCode: undefined,
  createConnector: (walletDetails) =>
    createConnector((config) => ({ ...injected({ target: "metaMask" })(config), ...walletDetails })),
});

const wallets = getDefaultWallets().wallets.map((group) => ({
  ...group,
  wallets: group.wallets.map((wallet) => (wallet === metaMaskWallet ? metaMaskExtensionWallet : wallet)),
}));

export const wagmiConfig = getDefaultConfig({
  appName: "AgriBridge",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [activeChain],
  wallets,
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
    [foundry.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"),
  },
  ssr: true,
});
