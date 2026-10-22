#!/usr/bin/env node
/**
 * Writes Safe{Wallet} Transaction Builder batches for the Sepolia deployment's setup, from the
 * deployment record. The Safe's owners import each file (Safe{Wallet} > Apps > Transaction
 * Builder > drag the file in), review it, and sign; nothing here signs or sends anything.
 *
 *   node scripts/safe-batches.mjs <outDir> <reporter> <reporter> <reporter> <regulator>
 *
 * 1-reporters-and-regulator.json  approves the local price reporters and gives the regulator role.
 * 2-freshness-48h.json            sets every crop's price freshness limit to 48 hours. Sign it only
 *                                 while prices are being kept up to date: after 48 hours without a
 *                                 new price, borrowing and settling stop for that crop.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeFunctionData, getAddress, keccak256, parseAbi, toHex } from "viem";

const SAFE = "0xDa152AfD8C2efDA383fde6F840f590C93738de12";
const [outDir, ...addresses] = process.argv.slice(2);
if (!outDir || addresses.length !== 4) {
  console.error("Usage: node scripts/safe-batches.mjs <outDir> <reporter> <reporter> <reporter> <regulator>");
  process.exit(1);
}
const [r1, r2, r3, regulator] = addresses.map((a) => getAddress(a));

const record = JSON.parse(readFileSync("broadcast/DeployDemo.s.sol/11155111/run-latest.json", "utf8"));
const deployed = Object.fromEntries(
  record.transactions.filter((t) => t.transactionType === "CREATE").map((t) => [t.contractName, getAddress(t.contractAddress)]),
);
const oracle = deployed.CommodityPriceOracle;
const registry = deployed.CommodityRegistry;
if (!oracle || !registry) throw new Error("The deployment record has no oracle or registry.");

const oracleAbi = parseAbi(["function addReporter(address)", "function setHeartbeat(uint256,uint256)"]);
const registryAbi = parseAbi(["function grantRole(bytes32,address)"]);

const tx = (to, data, label) => ({ to, value: "0", data, contractMethod: null, contractInputsValues: null, description: label });

function batch(name, description, transactions) {
  return {
    version: "1.0",
    chainId: "11155111",
    createdAt: Date.now(),
    meta: { name, description, txBuilderVersion: "1.16.5", createdFromSafeAddress: SAFE, createdFromOwnerAddress: "", checksum: "" },
    transactions: transactions.map(({ description: _label, ...t }) => t),
  };
}

const setup = [
  tx(oracle, encodeFunctionData({ abi: oracleAbi, functionName: "addReporter", args: [r1] }), `Approve reporter ${r1}`),
  tx(oracle, encodeFunctionData({ abi: oracleAbi, functionName: "addReporter", args: [r2] }), `Approve reporter ${r2}`),
  tx(oracle, encodeFunctionData({ abi: oracleAbi, functionName: "addReporter", args: [r3] }), `Approve reporter ${r3}`),
  tx(
    registry,
    encodeFunctionData({ abi: registryAbi, functionName: "grantRole", args: [keccak256(toHex("REGULATOR_ROLE")), regulator] }),
    `Give the regulator role to ${regulator}`,
  ),
];

const HOURS_48 = 48n * 3600n;
const freshness = [1n, 2n, 3n, 4n, 5n, 6n].map((id) =>
  tx(oracle, encodeFunctionData({ abi: oracleAbi, functionName: "setHeartbeat", args: [id, HOURS_48] }), `Crop ${id}: 48-hour limit`),
);

mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "1-reporters-and-regulator.json"),
  JSON.stringify(batch("AgriBridge v3: reporters and regulator", "Approve 3 local price reporters; give the regulator role.", setup), null, 2),
);
writeFileSync(
  join(outDir, "2-freshness-48h.json"),
  JSON.stringify(batch("AgriBridge v3: 48-hour price freshness", "Every crop's price must be refreshed within 48 hours.", freshness), null, 2),
);
console.log(`Oracle ${oracle}, registry ${registry}`);
for (const t of [...setup, ...freshness]) console.log(`  ${t.description}`);
console.log(`Wrote two batches to ${outDir}`);
