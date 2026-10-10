import { useConnection } from "wagmi";
import { ArchiveBoxIcon, BuildingOffice2Icon } from "@heroicons/react/24/outline";

import AppLayout from "../components/layout/AppLayout";
import { GradeBadge, LotLabel, LotState } from "../components/lots";
import { TxStatus } from "../components/TxStatus";
import { Badge, Card, EmptyState, Notice, PageHeader } from "../components/ui";
import { useCommodities, useHasRegistryRole, useLots, useWarehouses } from "../hooks/useProtocolData";
import { useTx } from "../hooks/useTx";
import { CommodityRegistryAbi } from "../lib/contracts/abis";
import { contracts, REGULATOR_ROLE } from "../lib/contracts/config";
import { kg, shortAddress } from "../lib/format";
import { useRememberedRole } from "../lib/session";

/**
 * The regulator's view: freeze a lot or a whole warehouse, for example while a
 * dispute or an inspection is under way. A frozen lot can't be borrowed against,
 * sold, moved or collected until it is unfrozen. Only wallets the Safe has given
 * the regulator role can act; anyone can see the page.
 */
export default function Regulator() {
  const role = useRememberedRole("investor");
  const { address } = useConnection();
  const { hasRole, isLoading } = useHasRegistryRole(REGULATOR_ROLE, address);
  const { lots } = useLots();
  const { byId: commodities } = useCommodities();
  const { warehouses, byId: warehouseById } = useWarehouses();
  const tx = useTx();

  const verified = lots.filter((l) => l.status === "Verified" && (l.supplyKg ?? 0n) > 0n);

  async function freezeLot(lotId: bigint, frozen: boolean) {
    try {
      await tx.send({ address: contracts.registry!, abi: CommodityRegistryAbi, functionName: "setLotFrozen", args: [lotId, frozen] }, frozen ? "Freeze" : "Unfreeze");
    } catch {
      // Shown by TxStatus.
    }
  }

  async function freezeWarehouse(warehouseId: bigint, frozen: boolean) {
    try {
      await tx.send(
        { address: contracts.registry!, abi: CommodityRegistryAbi, functionName: "setWarehouseFrozen", args: [warehouseId, frozen] },
        frozen ? "Freeze warehouse" : "Unfreeze warehouse",
      );
    } catch {
      // Shown by TxStatus.
    }
  }

  return (
    <AppLayout role={role} title="Regulator">
      <PageHeader
        eyebrow="Oversight"
        title="Regulator"
        subtitle="Freeze stock under investigation. Frozen stock can't be borrowed against, sold, moved or collected."
      />

      {!isLoading && !hasRole && (
        <Notice tone="warn">This wallet doesn&apos;t have the regulator role, so the buttons won&apos;t work. The verifier Safe grants it.</Notice>
      )}
      <TxStatus tx={tx} success="Done." />

      <Card title="Warehouses">
        {warehouses.length === 0 ? (
          <EmptyState icon={BuildingOffice2Icon}>No warehouses.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id.toString()}>
                    <td>
                      <span className="row" style={{ gap: 11, flexWrap: "nowrap" }}>
                        <span className={`stat-icon ${w.frozen ? "tone-red" : "tone-blue"}`}>
                          <BuildingOffice2Icon />
                        </span>
                        <span>
                          <strong>{w.name}</strong>
                          <div className="muted">{w.region}</div>
                        </span>
                      </span>
                    </td>
                    <td>{kg(w.storedKg)} stored</td>
                    <td>{w.frozen ? <Badge tone="red">Frozen</Badge> : <Badge tone="green">Open</Badge>}</td>
                    <td>
                      <button className={`btn btn-small ${w.frozen ? "btn-secondary" : "btn-danger"}`} disabled={!hasRole || tx.isBusy} onClick={() => void freezeWarehouse(w.id, !w.frozen)}>
                        {w.frozen ? "Unfreeze" : "Freeze"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ height: 28 }} />

      <Card title="Lots in storage">
        {verified.length === 0 ? (
          <EmptyState icon={ArchiveBoxIcon}>No stock in storage.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Grade</th>
                  <th>Warehouse</th>
                  <th>In storage</th>
                  <th>Farmer</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {verified.map((lot) => (
                  <tr key={lot.id.toString()}>
                    <td>
                      <LotLabel lot={lot} commodities={commodities} />
                    </td>
                    <td>
                      <GradeBadge grade={lot.currentGrade} />
                    </td>
                    <td>{warehouseById.get(lot.warehouseId)?.name}</td>
                    <td>{kg(lot.supplyKg)}</td>
                    <td className="muted">{shortAddress(lot.farmer)}</td>
                    <td>
                      <LotState lot={lot} />
                    </td>
                    <td>
                      <button className={`btn btn-small ${lot.frozen ? "btn-secondary" : "btn-danger"}`} disabled={!hasRole || tx.isBusy} onClick={() => void freezeLot(lot.id, !lot.frozen)}>
                        {lot.frozen ? "Unfreeze" : "Freeze"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
