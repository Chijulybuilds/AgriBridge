import { useId, useState } from "react";

import { useCommodities, type Commodity } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { CommodityConfigAbi } from "../../lib/contracts/abis";
import { contracts, PRICE_SOURCES } from "../../lib/contracts/config";
import { parseUsd, usd } from "../../lib/format";
import { TxStatus } from "../TxStatus";
import { Card, Notice } from "../ui";

/** A commodity's settings as the form edits them: percentages, days and dollars. */
type Draft = {
  name: string;
  active: boolean;
  priceSource: number;
  gradeB: string;
  gradeC: string;
  daysToB: string;
  daysToC: string;
  daysToExpiry: string;
  maxLoan: string;
  settleAt: string;
  basis: string;
  storage: string;
};

function toDraft(c?: Commodity): Draft {
  const pct = (bps: number) => String(bps / 100);
  return {
    name: c?.name ?? "",
    active: c?.active ?? true,
    priceSource: c?.priceSource ?? 0,
    gradeB: c ? pct(c.gradeBFactorBps) : "75",
    gradeC: c ? pct(c.gradeCFactorBps) : "40",
    daysToB: c ? String(c.daysToGradeB) : "180",
    daysToC: c ? String(c.daysToGradeC) : "360",
    daysToExpiry: c ? String(c.daysToExpiry) : "540",
    maxLoan: c ? pct(c.maxLtvBps) : "50",
    settleAt: c ? pct(c.liquidationLtvBps) : "80",
    basis: c ? pct(c.basisBps) : "10",
    storage: c ? (Number(c.storageFeePerTonMonth) / 1e6).toString() : "4",
  };
}

/** The contract's Commodity struct, or an error to show. The contract checks the rules too. */
function fromDraft(d: Draft) {
  const bps = (value: string) => Math.round(Number(value) * 100);
  const whole = (value: string) => Number(value);
  const numbers = [d.gradeB, d.gradeC, d.daysToB, d.daysToC, d.daysToExpiry, d.maxLoan, d.settleAt, d.basis];
  if (!d.name.trim()) return { error: "Give the crop a name." };
  if (numbers.some((n) => n.trim() === "" || !Number.isFinite(Number(n)) || Number(n) < 0)) return { error: "Fill in every number." };
  const storage = d.storage.trim() === "0" ? 0n : parseUsd(d.storage);
  if (storage === undefined) return { error: "Enter the storage fee in dollars per tonne per month." };
  return {
    value: {
      name: d.name.trim(),
      active: d.active,
      priceSource: d.priceSource,
      gradeBFactorBps: bps(d.gradeB),
      gradeCFactorBps: bps(d.gradeC),
      daysToGradeB: whole(d.daysToB),
      daysToGradeC: whole(d.daysToC),
      daysToExpiry: whole(d.daysToExpiry),
      maxLtvBps: bps(d.maxLoan),
      liquidationLtvBps: bps(d.settleAt),
      basisBps: bps(d.basis),
      storageFeePerTonMonth: storage,
    },
  };
}

/**
 * Each crop's rules: how its value falls with age, how much can be borrowed
 * against it, when an advance is settled, the basis cut and the storage fee.
 * Changes apply to new advances and to every lot's value from now on.
 */
export function CropsTab() {
  const { commodities } = useCommodities();
  return (
    <div className="stack">
      <Notice>The contract refuses rules that don&apos;t add up, for example settling an advance below its borrow limit.</Notice>
      {commodities.map((c) => (
        <Card key={c.id.toString()} title={`${c.name} · crop ${c.id.toString()}`}>
          <CropEditor commodity={c} />
        </Card>
      ))}
      <Card title="Add a crop">
        <CropEditor />
      </Card>
    </div>
  );
}

function CropEditor({ commodity }: { commodity?: Commodity }) {
  const id = useId();
  const tx = useTx();
  const [draft, setDraft] = useState<Draft>(toDraft(commodity));
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value });

  async function save() {
    setError(null);
    const result = fromDraft(draft);
    if ("error" in result) return setError(result.error ?? null);
    try {
      if (commodity) {
        await tx.send(
          { address: contracts.config!, abi: CommodityConfigAbi, functionName: "updateCommodity", args: [commodity.id, result.value] },
          "Save crop",
        );
      } else {
        await tx.send({ address: contracts.config!, abi: CommodityConfigAbi, functionName: "addCommodity", args: [result.value] }, "Add crop");
      }
    } catch {
      // Shown by TxStatus.
    }
  }

  const field = (label: string, key: keyof Draft, suffix?: string) => (
    <div className="field" style={{ marginBottom: 8 }}>
      <label htmlFor={`${id}-${key}`}>
        {label}
        {suffix ? ` (${suffix})` : ""}
      </label>
      <input id={`${id}-${key}`} className="input" value={String(draft[key])} onChange={set(key)} />
    </div>
  );

  return (
    <div>
      <div className="grid-4" style={{ marginBottom: 6 }}>
        {field("Name", "name")}
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor={`${id}-source`}>Price source</label>
          <select
            id={`${id}-source`}
            className="select"
            value={draft.priceSource}
            onChange={(e) => setDraft({ ...draft, priceSource: Number(e.target.value) })}
          >
            {PRICE_SOURCES.map((source, i) => (
              <option key={source} value={i}>
                {source}
              </option>
            ))}
          </select>
        </div>
        {field("Grade B worth", "gradeB", "% of A")}
        {field("Grade C worth", "gradeC", "% of A")}
        {field("Reaches Grade B after", "daysToB", "days")}
        {field("Reaches Grade C after", "daysToC", "days")}
        {field("Expires after", "daysToExpiry", "days")}
        {field("Borrow limit", "maxLoan", "% of value")}
        {field("Settled at", "settleAt", "% of value")}
        {field("Basis cut", "basis", "% off the world price")}
        {field("Storage fee", "storage", "$ per tonne a month")}
      </div>
      <div className="row" style={{ gap: 14 }}>
        <label className="row" style={{ fontSize: 14, gap: 8, minHeight: 40 }}>
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
          Accepting deliveries
        </label>
        <button className="btn btn-small" disabled={tx.isBusy} onClick={() => void save()}>
          {commodity ? `Save ${commodity.name}` : "Add crop"}
        </button>
        {commodity && <span className="muted">Storage now {usd(commodity.storageFeePerTonMonth)} per tonne a month</span>}
      </div>
      {error && <p className="form-error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
      <TxStatus tx={tx} success="Saved." />
    </div>
  );
}
