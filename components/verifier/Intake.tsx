import { useState } from "react";
import { keccak256, toHex, type Hex } from "viem";

import { useCommodities, useLots, useWarehouses, type Lot } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { CommodityRegistryAbi } from "../../lib/contracts/abis";
import { contracts, GRADES } from "../../lib/contracts/config";
import { date, kg, kgNumber, parseKg, shortAddress, textToBytes32 } from "../../lib/format";
import { lotName } from "../lots";
import { TxStatus } from "../TxStatus";
import { Card, EmptyState, Notice } from "../ui";

/**
 * Deliveries waiting at the warehouses. The Safe records what was actually
 * weighed, the grade, and a fingerprint (hash) of the signed inspection report;
 * approving creates the farmer's crop tokens. Or it rejects with a short reason.
 */
export function IntakeTab() {
  const { lots, isLoading } = useLots();
  const { byId: commodities } = useCommodities();
  const { byId: warehouses } = useWarehouses();
  const pending = lots.filter((l) => l.status === "Pending");

  return (
    <Card title={`Waiting for weighing and grading (${pending.length})`} testId="verifier-intake">
      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : pending.length === 0 ? (
        <EmptyState>No deliveries waiting.</EmptyState>
      ) : (
        <div className="stack">
          {pending.map((lot) => (
            <IntakeItem key={lot.id.toString()} lot={lot} name={lotName(lot, commodities)} warehouse={warehouses.get(lot.warehouseId)?.name} />
          ))}
        </div>
      )}
    </Card>
  );
}

function IntakeItem({ lot, name, warehouse }: { lot: Lot; name: string; warehouse?: string }) {
  const tx = useTx();
  const [measured, setMeasured] = useState(String(kgNumber(lot.estimatedKg)));
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
    <div className="card" style={{ padding: 14 }} data-testid={`intake-${lot.id}`}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <div>
          <strong>{name}</strong>
          <div className="muted">
            {warehouse} · farmer {shortAddress(lot.farmer)} · about {kg(lot.estimatedKg)} · harvested {date(lot.harvestDate)} · booked {date(lot.requestedAt)}
          </div>
        </div>
      </div>
      <div className="grid-3" style={{ marginBottom: 6, alignItems: "start" }}>
        <div className="field">
          <label>Measured weight (kg)</label>
          <input className="input" inputMode="decimal" value={measured} onChange={(e) => setMeasured(e.target.value)} data-testid="measured-kg" />
        </div>
        <div className="field">
          <label>Grade</label>
          <select className="select" value={grade} onChange={(e) => setGrade(Number(e.target.value))} data-testid="grade">
            {GRADES.map((g, i) => (
              <option key={g} value={i}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Signed inspection report</label>
          <input className="input" type="file" onChange={(e) => void onReport(e.target.files?.[0])} />
          <input
            className="input"
            placeholder="or its reference number"
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
      {error && <p className="form-error">{error}</p>}
      <div className="row">
        <button className="btn" disabled={tx.isBusy} onClick={() => void approve()} data-testid="approve">
          Approve and create the stock
        </button>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Reason (max 32 characters)" maxLength={32} value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn btn-danger" disabled={tx.isBusy} onClick={() => void reject()}>
          Reject
        </button>
      </div>
      <TxStatus tx={tx} success="Recorded." />
      {tx.viaSafe && tx.state === "idle" && <Notice>Each action becomes a Safe transaction for the owners to confirm.</Notice>}
    </div>
  );
}
