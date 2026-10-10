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
 * - the public app signs people in with MetaMask (`appConfig`; the end-to-end
 *   tests use their own browser test wallet);
 * - the hidden /verifier page only talks to the verifier Safe, opened as a Safe
 *   App (`verifierConfig`), or to a browser wallet for local development.
 */
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);

export const activeChain = chainId === foundry.id ? foundry : sepolia;

export const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL || (activeChain.id === foundry.id ? "http://127.0.0.1:8545" : undefined);

/**
 * Where the activity feed reads event history. Free plans of hosted RPCs (Alchemy's allows 10
 * blocks per log query) can't scan history, so this can point at an endpoint that can, while
 * everything else uses NEXT_PUBLIC_RPC_URL. Defaults to the same endpoint.
 */
export const logsRpcUrl = process.env.NEXT_PUBLIC_LOGS_RPC_URL || rpcUrl;

const transports = {
  [sepolia.id]: http(activeChain.id === sepolia.id ? rpcUrl : undefined),
  [foundry.id]: http(activeChain.id === foundry.id ? rpcUrl : "http://127.0.0.1:8545"),
};

/** The public app: MetaMask, found through the browser (EIP-6963). */
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
