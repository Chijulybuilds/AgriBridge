import { ethers } from 'ethers';
import { provider, signer, contractAddresses } from '../lib/chain.js';
import { COMMODITY_TYPE_ORDER, type CommodityType } from '../types/index.js';

/**
 * On-chain half of the flow. This is where the backend acts as the authorized
 * VERIFIER: it calls CommodityVerifier.verifyCommodity(...), which prices the
 * batch via the oracle and mints the ERC-1155 collateral token.
 *
 * Minimal ABIs are inlined for the calls the backend actually makes. Once the
 * contracts are compiled you can instead import the full ABIs from Foundry's
 * `out/` artifacts.
 */
const verifierAbi = [
  'function verifyCommodity(uint256 commodityId, string inspectionReference, string warehouseReference, bytes32 reportHash) external',
  'function rejectCommodity(uint256 commodityId, string reason) external',
  'event VerificationApproved(uint256 indexed commodityId, address indexed verifier, uint256 tokenId, uint96 quantity, uint256 collateralValueUsd, address farmer, bytes32 verificationHash, uint256 timestamp)',
];

const oracleAbi = [
  'function setPrice(uint8 commodity, uint128 newPrice) external',
  'function getPrice(uint8 commodity) external view returns (uint256 answer, uint256 updatedAt)',
];

function toChainType(t: CommodityType): number {
  return COMMODITY_TYPE_ORDER.indexOf(t);
}

export const chainService = {
  /** Approve + mint. Returns the tx hash; the emitted event carries the tokenId. */
  async verifyCommodity(params: {
    onChainId: number;
    inspectionReference: string;
    warehouseReference: string;
    reportHash: string;
  }): Promise<{ txHash: string }> {
    const verifier = new ethers.Contract(contractAddresses.verifier, verifierAbi, signer);
    const tx = await verifier.verifyCommodity(
      params.onChainId,
      params.inspectionReference,
      params.warehouseReference,
      params.reportHash,
    );
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async rejectCommodity(onChainId: number, reason: string): Promise<{ txHash: string }> {
    const verifier = new ethers.Contract(contractAddresses.verifier, verifierAbi, signer);
    const tx = await verifier.rejectCommodity(onChainId, reason);
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
