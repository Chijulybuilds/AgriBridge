import { useState } from "react";
import { BuildingOffice2Icon } from "@heroicons/react/24/outline";

import { useWarehouses, type Warehouse } from "../../hooks/useProtocolData";
import { useTx } from "../../hooks/useTx";
import { CommodityRegistryAbi } from "../../lib/contracts/abis";
import { contracts } from "../../lib/contracts/config";
import { kg } from "../../lib/format";
import { TxStatus } from "../TxStatus";
import { Badge, Card, EmptyState } from "../ui";

const TONNE = 1000n * 10n ** 18n;

/** The warehouses farmers can deliver to: add one, or change its name, region, capacity or whether it takes deliveries. */
export function WarehousesTab() {
  const { warehouses } = useWarehouses();
  return (
    <div className="stack">
      <Card title="Warehouses">
        {warehouses.length === 0 ? (
          <EmptyState icon={BuildingOffice2Icon}>No warehouses yet.</EmptyState>
        ) : (
          <div className="stack">
            {warehouses.map((w) => (
              <WarehouseEditor key={w.id.toString()} warehouse={w} />
            ))}
          </div>
        )}
      </Card>
      <Card title="Add a warehouse">
        <WarehouseEditor />
      </Card>
    </div>
  );
}

function WarehouseEditor({ warehouse }: { warehouse?: Warehouse }) {
  const tx = useTx();
  const [name, setName] = useState(warehouse?.name ?? "");
  const [region, setRegion] = useState(warehouse?.region ?? "");
  const [tonnes, setTonnes] = useState(warehouse ? String(warehouse.capacityKg / TONNE) : "");
  const [active, setActive] = useState(warehouse?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the warehouse a name.");
    if (!/^\d+$/.test(tonnes.trim()) || BigInt(tonnes.trim()) === 0n) return setError("Enter the capacity in whole tonnes.");
    const capacityKg = BigInt(tonnes.trim()) * TONNE;
    try {
      if (warehouse) {
        await tx.send(
          {
            address: contracts.registry!,
            abi: CommodityRegistryAbi,
            functionName: "updateWarehouse",
            args: [warehouse.id, name.trim(), region.trim(), capacityKg, active],
          },
          "Save warehouse",
        );
      } else {
        await tx.send(
          { address: contracts.registry!, abi: CommodityRegistryAbi, functionName: "addWarehouse", args: [name.trim(), region.trim(), capacityKg] },
          "Add warehouse",
        );
      }
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <div className={warehouse ? "card-sunken" : undefined}>
      {warehouse && (
        <div className="spread" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <span className="row" style={{ gap: 11, flexWrap: "nowrap" }}>
            <span className={`stat-icon ${warehouse.frozen ? "tone-red" : "tone-blue"}`}>
              <BuildingOffice2Icon />
            </span>
            <strong>
              {warehouse.name} <span className="muted">· warehouse {warehouse.id.toString()}</span>
            </strong>
          </span>
          <span className="row" style={{ gap: 6 }}>
            {warehouse.frozen && <Badge tone="red">Frozen by the regulator</Badge>}
            <span className="muted">
              {kg(warehouse.storedKg)} of {kg(warehouse.capacityKg)} used
            </span>
          </span>
        </div>
      )}
      <div className="row">
        <input className="input" style={{ maxWidth: 200 }} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" style={{ maxWidth: 200 }} placeholder="Region, country" value={region} onChange={(e) => setRegion(e.target.value)} />
        <input className="input" style={{ maxWidth: 140 }} placeholder="Capacity (t)" inputMode="numeric" value={tonnes} onChange={(e) => setTonnes(e.target.value)} />
        {warehouse && (
          <label className="row" style={{ fontSize: 13, gap: 6 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Taking deliveries
          </label>
        )}
        <button className="btn btn-small" disabled={tx.isBusy} onClick={() => void save()}>
          {warehouse ? "Save" : "Add"}
        </button>
      </div>
      {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}
      <TxStatus tx={tx} success="Saved." />
    </div>
  );
}
