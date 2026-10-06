import { createConfig, http } from "wagmi";
import { foundry, sepolia } from "wagmi/chains";
import { injected, safe } from "wagmi/connectors";

/**
 * Chain and wallet configuration.
 *
 * Sepolia is the deployment target. The local Foundry chain is supported so the
 * app can be driven against `anvil` during development and the Playwright tests
 * without touching a public network.
 *
 * There are two wallet setups, kept apart on purpose:
 * - the public app signs people in with MetaMask Embedded Wallets when
 *   NEXT_PUBLIC_WEB3AUTH_CLIENT_ID is set (see components/providers.tsx), and
 *   otherwise offers plain browser wallets (`appConfig`), which is what local
 *   development and the end-to-end tests use;
 * - the hidden /verifier page only talks to the verifier Safe, opened as a Safe
 *   App (`verifierConfig`), or to a browser wallet for local development.
 */
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);

export const activeChain = chainId === foundry.id ? foundry : sepolia;

export const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL || (activeChain.id === foundry.id ? "http://127.0.0.1:8545" : undefined);

const transports = {
  [sepolia.id]: http(activeChain.id === sepolia.id ? rpcUrl : undefined),
  [foundry.id]: http(activeChain.id === foundry.id ? rpcUrl : "http://127.0.0.1:8545"),
};

/** Public app without MetaMask Embedded Wallets: browser wallets only. */
export const appConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports,
  ssr: true,
});

/** The /verifier page: the Safe (as a Safe App), or a browser wallet for local development. */
export const verifierConfig = createConfig({
  chains: [activeChain],
  connectors: [safe({ allowedDomains: [/app\.safe\.global$/], debug: false }), injected()],
  transports,
  ssr: true,
});

/**
 * MetaMask Embedded Wallets client ID, from the MetaMask Developer Dashboard. Public, not a secret.
 * The end-to-end tests (NEXT_PUBLIC_E2E) always use browser wallets, which they can drive.
 */
export const web3AuthClientId = process.env.NEXT_PUBLIC_E2E ? undefined : process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || undefined;

/** "sapphire_devnet" while testing; "sapphire_mainnet" for a real launch. */
export const web3AuthNetwork =
  process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK === "sapphire_mainnet" ? "sapphire_mainnet" : "sapphire_devnet";
