import { ethers } from 'ethers';
import { provider, signer, contractAddresses } from '../lib/chain.js';
import { COMMODITY_TYPE_ORDER, type CommodityType } from '../types/index.js';

/**
 * On-chain half of the flow. This is where the backend acts as the authorized
 * VERIFIER: it calls CommodityRegistry.approveCommodity(...) to verify and mint
 * the ERC-1155 collateral token.
 */
const registryAbi = [
  'function approveCommodity(uint256 _commodityId) external',
  'function rejectCommodity(uint256 _commodityId, bytes32 _rejectionReason) external',
];

const oracleAbi = [
  'function setPrice(uint8 commodity, uint128 newPrice) external',
  'function getPrice(uint8 commodity) external view returns (uint256 answer, uint256 updatedAt)',
];

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
