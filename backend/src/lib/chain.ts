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
} catch (error) {
  console.warn(
    `\n⚠️  Warning: Failed to initialize Wallet with VERIFIER_PRIVATE_KEY from environment.\n` +
    `Falling back to a randomly generated wallet for development.\n` +
    `On-chain write operations will fail until a valid private key is configured.\n`
  );
  verifierWallet = ethers.Wallet.createRandom(provider);
}

export const signer = verifierWallet;

export const contractAddresses = {
  registry: env.COMMODITY_REGISTRY_ADDRESS,
  verifier: env.COMMODITY_VERIFIER_ADDRESS,
  token: env.COMMODITY_TOKEN_ADDRESS,
  priceOracle: env.COMMODITY_PRICE_ORACLE_ADDRESS,
  lendingPool: env.LENDING_POOL_ADDRESS,
  liquidityShareToken: env.LIQUIDITY_SHARE_TOKEN_ADDRESS,
} as const;
