import { useAccount, useReadContract } from "wagmi";

import { DemoUSDCAbi } from "../lib/contracts/abis";
import { contracts } from "../lib/contracts/config";
import { demoMode } from "../lib/demo";
import { formatUsdc, useTx } from "../hooks/useProtocol";

/** 10,000 dUSDC per click (6 decimals). */
const FAUCET_AMOUNT = 10_000n * 10n ** 6n;

/**
 * "Get test USDC" for demo deployments, whose USDC is the play-money DemoUSDC
 * with a public faucet (see script/DeployDemo.s.sol). Hidden outside demo mode.
 */
export function DemoFaucet() {
  const { address } = useAccount();
  const tx = useTx();
  const usdc = contracts.usdc;

  const { data: balance, refetch } = useReadContract({
    address: usdc,
    abi: DemoUSDCAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(demoMode && address && usdc), refetchInterval: 10_000 },
  });

  if (!demoMode || !address || !usdc) return null;

  async function claim() {
    try {
      await tx.writeAndWait({
        address: usdc!,
        abi: DemoUSDCAbi,
        functionName: "faucet",
        args: [address!, FAUCET_AMOUNT],
      });
      await refetch();
    } catch {
      // The reason shows in the button's tooltip.
    }
  }

  return (
    <button
      onClick={claim}
      disabled={tx.isBusy}
      data-testid="demo-faucet"
      title={tx.error ? tx.error.message : "Mint 10,000 play-money USDC to this wallet"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px dashed var(--accent-gold)",
        background: "var(--accent-gold-bg)",
        color: "var(--text-primary)",
        fontSize: 12,
        fontWeight: 600,
        cursor: tx.isBusy ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {tx.isBusy ? "Minting…" : "+10k test USDC"}
      <span style={{ fontWeight: 400, color: "var(--text-muted)" }} data-testid="demo-usdc-balance">
        {formatUsdc(balance as bigint | undefined, 0)} held
      </span>
    </button>
  );
}
