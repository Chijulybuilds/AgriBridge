import { useConnection } from "wagmi";

import { DemoUSDCAbi } from "../lib/contracts/abis";
import { contracts } from "../lib/contracts/config";
import { useUsdc } from "../hooks/useProtocolData";
import { friendlyError, useTx } from "../hooks/useTx";

/** $10,000 of test dollars per click (6 decimals). */
const FAUCET_AMOUNT = 10_000n * 10n ** 6n;

/**
 * "Get test dollars", on demo deployments only: their USDC is play money with a
 * public faucet (script/DeployDemo.s.sol). Hidden where the app uses real USDC.
 */
export function DemoFaucet() {
  const { address } = useConnection();
  const { hasFaucet } = useUsdc(address);
  const tx = useTx();

  if (!hasFaucet || !address || !contracts.usdc) return null;

  return (
    <button
      className="btn btn-secondary btn-small"
      data-testid="demo-faucet"
      disabled={tx.isBusy}
      title={tx.error ? friendlyError(tx.error) : "Adds $10,000 of play money to your account"}
      onClick={() =>
        void tx
          .send({ address: contracts.usdc!, abi: DemoUSDCAbi, functionName: "faucet", args: [address, FAUCET_AMOUNT] })
          .catch(() => {})
      }
    >
      {tx.isBusy ? "Adding…" : "Get test dollars"}
    </button>
  );
}
