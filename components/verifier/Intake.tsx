import { useId, useState } from "react";
import { keccak256, toHex, type Hex } from "viem";
import { InboxArrowDownIcon } from "@heroicons/react/24/outline";

import { useCommodities, useLots, useWarehouses, type Commodity, type Lot } from "../../hooks/useProtocolData";
import { useTx, type Tx } from "../../hooks/useTx";
import { CommodityRegistryAbi } from "../../lib/contracts/abis";
import { contracts, GRADES } from "../../lib/contracts/config";
import { date, kg, kgInput, parseKg, shortAddress, textToBytes32 } from "../../lib/format";
import { LotLabel } from "../lots";
import { TxStatus } from "../TxStatus";
import { Card, EmptyState, Notice, Skeleton } from "../ui";

/**
 * Deliveries waiting at the warehouses. The Safe records what was actually
 * weighed, the grade, and a fingerprint (hash) of the signed inspection report;
 * approving creates the farmer's crop tokens. Or it rejects with a short reason.
 */
export function IntakeTab() {
  const { lots, isLoading } = useLots();
  const { byId: commodities } = useCommodities();
  const { byId: warehouses } = useWarehouses();
  // One status for the whole queue: a delivery leaves the list once it's handled, and the result must stay on screen.
  const tx = useTx();
  const pending = lots.filter((l) => l.status === "Pending");

  return (
    <Card title={`Waiting for weighing and grading (${pending.length})`} testId="verifier-intake">
      {isLoading ? (
        <Skeleton rows={3} />
      ) : pending.length === 0 ? (
        <EmptyState icon={InboxArrowDownIcon}>No deliveries waiting. New bookings from farmers appear here.</EmptyState>
      ) : (
        <div className="stack">
          {pending.map((lot) => (
            <IntakeItem key={lot.id.toString()} tx={tx} lot={lot} commodities={commodities} warehouse={warehouses.get(lot.warehouseId)?.name} />
          ))}
        </div>
      )}
      <TxStatus tx={tx} success={tx.step === "Reject" ? "Rejected. The farmer sees your reason." : "Approved. The stock is now in the farmer's name."} />
      {tx.viaSafe && tx.state === "idle" && pending.length > 0 && (
        <Notice>Each action becomes a Safe transaction for the owners to confirm.</Notice>
      )}
    </Card>
  );
}

function IntakeItem({ tx, lot, commodities, warehouse }: { tx: Tx; lot: Lot; commodities: Map<bigint, Commodity>; warehouse?: string }) {
  const id = useId();
  const [measured, setMeasured] = useState(kgInput(lot.estimatedKg));
  const [grade, setGrade] = useState(0);
  const [evidence, setEvidence] = useState<Hex>();
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onReport(file: File | undefined) {
    if (!file) return;
    // Only the report's fingerprint goes on-chain; the report itself stays with the warehouse.
    setEvidence(keccak256(new Uint8Array(await file.arrayBuffer())));
    setEvidenceLabel(file.name);
  }

  async function approve() {
    setError(null);
    const measuredKg = parseKg(measured);
    if (!measuredKg) return setError("Enter the measured weight.");
    if (!evidence) return setError("Attach the signed inspection report (or enter its reference).");
    try {
      await tx.send(
        { address: contracts.registry!, abi: CommodityRegistryAbi, functionName: "approveIntake", args: [lot.id, measuredKg, grade, evidence] },
        "Approve",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  async function reject() {
    setError(null);
    if (!reason.trim()) return setError("Give a short reason for the farmer.");
    try {
      await tx.send(
        { address: contracts.registry!, abi: CommodityRegistryAbi, functionName: "rejectIntake", args: [lot.id, textToBytes32(reason)] },
        "Reject",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <div className="card-sunken" data-testid={`intake-${lot.id}`}>
      <div style={{ marginBottom: 14 }}>
        <LotLabel
          lot={lot}
          commodities={commodities}
          sub={`${warehouse} · farmer ${shortAddress(lot.farmer)} · about ${kg(lot.estimatedKg)} · harvested ${date(lot.harvestDate)} · booked ${date(lot.requestedAt)}`}
        />
      </div>
      <div className="grid-3" style={{ marginBottom: 6, alignItems: "start" }}>
        <div className="field">
          <label htmlFor={`${id}-kg`}>Measured weight (kg)</label>
          <input id={`${id}-kg`} className="input" inputMode="decimal" value={measured} onChange={(e) => setMeasured(e.target.value)} data-testid="measured-kg" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-grade`}>Grade</label>
          <select id={`${id}-grade`} className="select" value={grade} onChange={(e) => setGrade(Number(e.target.value))} data-testid="grade">
            {GRADES.map((g, i) => (
              <option key={g} value={i}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-report`}>Signed inspection report</label>
          <input id={`${id}-report`} className="input" type="file" onChange={(e) => void onReport(e.target.files?.[0])} />
          <label htmlFor={`${id}-ref`} style={{ marginTop: 4 }}>
            Or its reference number
          </label>
          <input
            id={`${id}-ref`}
            className="input"
            placeholder="KANO-2026-0142"
            onChange={(e) => {
              const text = e.target.value.trim();
              setEvidenceLabel("");
              setEvidence(text ? keccak256(toHex(text)) : undefined);
            }}
            data-testid="evidence-ref"
          />
          {evidence && <span className="hint">Fingerprint {evidence.slice(0, 10)}…{evidenceLabel ? ` of ${evidenceLabel}` : ""}</span>}
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="spread" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <button className="btn" disabled={tx.isBusy} onClick={() => void approve()} data-testid="approve">
          Approve and create the stock
        </button>
        <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
          <div className="field" style={{ marginBottom: 0, width: 260 }}>
            <label htmlFor={`${id}-reason`}>Reason, if you reject it</label>
            <input
              id={`${id}-reason`}
              className="input"
              placeholder="Moisture too high"
              maxLength={32}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button className="btn btn-danger" disabled={tx.isBusy} onClick={() => void reject()}>
            Reject delivery
          </button>
        </div>
      </div>
    </div>
  );
}
