import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useConnection } from "wagmi";
import { MegaphoneIcon } from "@heroicons/react/24/outline";

import AppLayout from "../components/layout/AppLayout";
import { TxStatus } from "../components/TxStatus";
import { Badge, Card, CropSeal, EmptyState, Money, Notice, PageHeader } from "../components/ui";
import { useCommodities, useIsReporter, useOracleStatus, type Commodity } from "../hooks/useProtocolData";
import { useTx } from "../hooks/useTx";
import { CommodityPriceOracleAbi } from "../lib/contracts/abis";
import { contracts } from "../lib/contracts/config";
import { dateTime, parseNairaPrice, percentFromBps, shortAddress } from "../lib/format";
import { publicClient } from "../lib/chain";
import { useRememberedRole } from "../lib/session";

/**
 * Local price reporters: market reporters the Safe has approved post what yam and cashew sell for
 * locally. A price counts once enough of them agree (2 of 3 by default, within 5% of each other),
 * and a big jump is still held for confirmation like any other price. Anyone can see the reports;
 * only approved reporters can post.
 */
export default function Reporter() {
  const role = useRememberedRole("farmer");
  const { address } = useConnection();
  const { isReporter, reporters, isLoading } = useIsReporter(address);
  const { commodities } = useCommodities();
  const { status } = useOracleStatus();
  const local = commodities.filter((c) => c.priceSource === 1);

  return (
    <AppLayout role={role} title="Report prices" requireWallet={false}>
      <PageHeader
        eyebrow="Local prices"
        title="Report prices"
        subtitle="Approved market reporters post what yam and cashew sell for today. A price counts once most reporters agree."
      />
      {status && (
        <Notice>
          A new price is used once {status.localQuorum} of the {reporters.length || "approved"} reporters agree, within{" "}
          {percentFromBps(500)}{" "}of each other. Reports older than a day don&apos;t count. A jump of more than{" "}
          {percentFromBps(status.maxMoveBps)} is held until it is confirmed later, like every price.
        </Notice>
      )}
      {!isLoading && !isReporter && (
        <Card>
          <EmptyState art="info" icon={MegaphoneIcon} title="Only approved reporters can post prices">
            The AgriBridge Safe approves local market reporters. Everyone can see their reports below.
          </EmptyState>
        </Card>
      )}
      {local.map((c) => (
        <CropReports key={c.id.toString()} commodity={c} reporters={reporters} canReport={isReporter} />
      ))}
    </AppLayout>
  );
}

function CropReports({ commodity, reporters, canReport }: { commodity: Commodity; reporters: Address[]; canReport: boolean }) {
  const tx = useTx();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const oracle = contracts.oracle;
  const { data: reports } = useQuery({
    queryKey: ["local-reports", oracle, commodity.id.toString(), reporters.join()],
    enabled: Boolean(oracle && reporters.length),
    refetchInterval: 15_000,
    queryFn: () =>
      Promise.all(
        reporters.map(async (reporter) => {
          const [price, reportedAt] = await publicClient.readContract({
            address: oracle!,
            abi: CommodityPriceOracleAbi,
            functionName: "getReport",
            args: [commodity.id, reporter],
          });
          return { reporter, price, reportedAt };
        }),
      ),
  });

  async function submit() {
    setError(null);
    const price = parseNairaPrice(value);
    if (!price) return setError("Enter today's price in naira per kilogram, such as 4,800.");
    try {
      await tx.send(
        {
          address: oracle!,
          abi: CommodityPriceOracleAbi,
          functionName: "submitLocalPrice",
          args: [commodity.id, price],
        },
        `Report ${commodity.name}`,
      );
      setValue("");
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <Card title={commodity.name} help="prices" tour="reporter-form">
      <div className="row" style={{ gap: 12, marginBottom: 12 }}>
        <CropSeal name={commodity.name} size={30} />
        <span>
          Price in use:{" "}
          <strong>
            <Money value={commodity.price} price />
          </strong>
          {commodity.heldPrice !== undefined && (
            <>
              {" "}
              <Badge tone="gold">Held</Badge> <Money value={commodity.heldPrice} price /> waiting to be confirmed
            </>
          )}
        </span>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Reporter</th>
              <th>Last report</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {(reports ?? []).map((r) => (
              <tr key={r.reporter}>
                <td>{shortAddress(r.reporter)}</td>
                <td>{r.price > 0n ? <Money value={r.price} price /> : "—"}</td>
                <td className="muted">{r.reportedAt > 0n ? dateTime(r.reportedAt) : "No report yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canReport && (
        <div style={{ marginTop: 14 }}>
          <label htmlFor={`report-${commodity.id}`}>Today&apos;s price where you are (₦ per kg)</label>
          <div className="row" style={{ flexWrap: "nowrap", marginTop: 6 }}>
            <input
              id={`report-${commodity.id}`}
              className="input"
              style={{ maxWidth: 140 }}
              inputMode="decimal"
              placeholder="4800"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              data-testid={`report-${commodity.id}`}
            />
            <button type="button" className="btn" disabled={tx.isBusy} onClick={() => void submit()} data-testid={`submit-report-${commodity.id}`}>
              Send my report
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert" style={{ margin: "6px 0 0" }}>
              {error}
            </p>
          )}
          <TxStatus tx={tx} success="Report sent. The price updates once enough reporters agree." />
        </div>
      )}
    </Card>
  );
}
