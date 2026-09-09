import { ethers } from 'ethers';
import { provider, signer, contractAddresses } from '../lib/chain.js';
import { COMMODITY_TYPE_ORDER, type CommodityType } from '../types/index.js';

/**
 * On-chain half of the flow. This is where the backend acts as the authorized
 * VERIFIER: it calls CommodityRegistry.approveCommodity(...) to verify and mint
 * the ERC-1155 collateral token.
 *
 * ABIs are generated from Foundry artifacts by scripts/generate-abis.mjs rather
 * than hand-written. Hand-written fragments are how this service ended up
 * calling a CommodityVerifier contract that was never deployed.
 */
import registryAbi from '../abis/CommodityRegistry.json' with { type: 'json' };
import oracleAbi from '../abis/CommodityPriceOracle.json' with { type: 'json' };

function toChainType(t: CommodityType): number {
  return COMMODITY_TYPE_ORDER.indexOf(t);
}

function stringToBytes32(str: string): string {
  try {
    const truncated = str.substring(0, 31);
    return ethers.encodeBytes32String(truncated);
  } catch (error) {
    const bytes = ethers.toUtf8Bytes(str);
    const sliced = bytes.slice(0, 32);
    return ethers.hexlify(ethers.zeroPadValue(sliced, 32));
  }
}

export const chainService = {
  /** Approve + mint. Returns the tx hash. */
  async verifyCommodity(params: {
    onChainId: number;
  }): Promise<{ txHash: string }> {
    const registry = new ethers.Contract(contractAddresses.registry, registryAbi, signer);
    const tx = await registry.approveCommodity(params.onChainId);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async rejectCommodity(onChainId: number, reason: string): Promise<{ txHash: string }> {
    const registry = new ethers.Contract(contractAddresses.registry, registryAbi, signer);
    const reasonBytes32 = stringToBytes32(reason);
    const tx = await registry.rejectCommodity(onChainId, reasonBytes32);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async getPrice(type: CommodityType): Promise<{ price: string; updatedAt: number }> {
    const oracle = new ethers.Contract(contractAddresses.priceOracle, oracleAbi, provider);
    const [answer, updatedAt] = await oracle.getPrice(toChainType(type));
    return { price: answer.toString(), updatedAt: Number(updatedAt) };
  },

  async setPrice(type: CommodityType, price: bigint): Promise<{ txHash: string }> {
    const oracle = new ethers.Contract(contractAddresses.priceOracle, oracleAbi, signer);
    const tx = await oracle.setPrice(toChainType(type), price);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },
};
