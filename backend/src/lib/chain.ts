import { ethers } from 'ethers';
import { env } from '../config/env.js';

/**
 * Thin blockchain access layer.
 *
 * `provider`  — read-only connection to the chain (view calls, event reads).
 * `signer`    — the backend "verifier" wallet. It holds VERIFIER_ROLE and
 *               PRICE_UPDATER_ROLE on-chain, so it can approve commodities,
 *               trigger minting, and push oracle prices.
 *
 * Contract instances are created lazily in the service layer with their ABIs
 * (see src/services/chain.service.ts) once addresses are populated in .env.
 */
export const provider = new ethers.JsonRpcProvider(env.RPC_URL, env.CHAIN_ID);

let verifierWallet: ethers.HDNodeWallet | ethers.Wallet;
try {
  verifierWallet = new ethers.Wallet(env.VERIFIER_PRIVATE_KEY, provider);
} catch {
  // Falling back to a random wallet silently produces a backend that looks
  // healthy but cannot approve anything, since the random address holds no
  // VERIFIER_ROLE. Outside mock mode this is a fatal misconfiguration.
  if (!env.USE_MOCK_DB) {
    console.error(
      '\n❌ VERIFIER_PRIVATE_KEY is missing or malformed.\n' +
        '   The backend cannot approve or reject commodities without it.\n' +
        '   Set a valid key, or run with USE_MOCK_DB=true for local UI work.\n',
    );
    process.exit(1);
  }

  console.warn('\n⚠️  Mock mode: using a throwaway verifier wallet. On-chain writes will fail.\n');
  verifierWallet = ethers.Wallet.createRandom(provider);
}

export const signer = verifierWallet;

/**
 * Deployed contract addresses.
 *
 * There is deliberately no `verifier` entry: no CommodityVerifier contract
 * exists. Approval and rejection are functions on CommodityRegistry.
 */
export const contractAddresses = {
  registry: env.COMMODITY_REGISTRY_ADDRESS,
  token: env.COMMODITY_TOKEN_ADDRESS,
  priceOracle: env.COMMODITY_PRICE_ORACLE_ADDRESS,
  lendingPool: env.LENDING_POOL_ADDRESS,
  liquidityShareToken: env.LIQUIDITY_SHARE_TOKEN_ADDRESS,
} as const;
