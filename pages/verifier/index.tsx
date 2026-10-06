import Head from "next/head";
import { useEffect, useState } from "react";
import { useConnect, useConnection, useConnectors } from "wagmi";

import { ThemeToggle } from "../../components/ThemeToggle";
import { NetworkGuard } from "../../components/NetworkGuard";
import { Tabs } from "../../components/ui";
import { AdvancesTab } from "../../components/verifier/Advances";
import { ClearanceTab } from "../../components/verifier/Clearance";
import { CollectionsTab } from "../../components/verifier/Collections";
import { CropsTab } from "../../components/verifier/Crops";
import { IntakeTab } from "../../components/verifier/Intake";
import { PricesTab } from "../../components/verifier/Prices";
import { WarehousesTab } from "../../components/verifier/Warehouses";
import { VERIFIER_SAFE } from "../../lib/contracts/config";
import { shortAddress } from "../../lib/format";

const TABS = [
  { id: "intake", label: "Intake" },
  { id: "collections", label: "Collections" },
  { id: "advances", label: "Advances" },
  { id: "prices", label: "Prices" },
  { id: "clearance", label: "Clearance" },
  { id: "warehouses", label: "Warehouses" },
  { id: "crops", label: "Crops" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * The verifier console. It is linked from nowhere, kept out of search engines,
 * and opens only when the connected wallet is the verifier Safe; anyone else
 * sees "not found". That is privacy, not security: the contracts accept these
 * actions from the Safe alone. The Safe owners open the site inside Safe{Wallet}
 * (as a Safe App), and each action becomes a Safe transaction for them to confirm.
 */
export default function Verifier() {
  const { address, isConnected, status } = useConnection();
  const isSafe = Boolean(VERIFIER_SAFE && address && address.toLowerCase() === VERIFIER_SAFE.toLowerCase());

  return (
    <>
      <Head>
        <title>AgriBridge</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {!VERIFIER_SAFE || (isConnected && !isSafe) ? (
        <NotFound />
      ) : !isConnected ? (
        <ConnectScreen connecting={status === "connecting" || status === "reconnecting"} />
      ) : (
        <Console safe={address!} />
      )}
    </>
  );
}

function Console({ safe }: { safe: string }) {
  const [tab, setTab] = useState<TabId>("intake");
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <header className="spread" style={{ height: 56, padding: "0 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <strong>
          Agri<span style={{ color: "var(--accent-green)" }}>Bridge</span> · Verifier
        </strong>
        <div className="row">
          <span className="badge badge-blue" title={safe} data-testid="verifier-safe">
            Safe {shortAddress(safe)}
          </span>
          <ThemeToggle variant="minimal" />
        </div>
      </header>
      <main style={{ padding: "20px", maxWidth: 1200, margin: "0 auto" }}>
        <NetworkGuard />
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        {tab === "intake" && <IntakeTab />}
        {tab === "collections" && <CollectionsTab />}
        {tab === "advances" && <AdvancesTab />}
        {tab === "prices" && <PricesTab />}
        {tab === "clearance" && <ClearanceTab />}
        {tab === "warehouses" && <WarehousesTab />}
        {tab === "crops" && <CropsTab />}
      </main>
    </div>
  );
}

/** Connect the Safe: automatic inside Safe{Wallet}; a browser wallet only for local development. */
function ConnectScreen({ connecting }: { connecting: boolean }) {
  const connectors = useConnectors();
  const { mutate: connect, isPending } = useConnect();
  const safeConnector = connectors.find((c) => c.id === "safe");

  // Inside Safe{Wallet} the page runs in an iframe; connect to the Safe straight away.
  useEffect(() => {
    if (safeConnector && typeof window !== "undefined" && window.parent !== window) connect({ connector: safeConnector });
  }, [safeConnector, connect]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-secondary)", padding: 16 }}>
      <div className="card" style={{ maxWidth: 380, width: "100%" }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Connect</h1>
        <p className="hint" style={{ marginBottom: 14 }}>Open this page from Safe{"{"}Wallet{"}"}, or connect the authorised wallet.</p>
        <div className="stack" style={{ gap: 8 }}>
          {connectors
            .filter((c) => c.id !== "safe")
            .map((c) => (
              <button key={c.uid} className="btn btn-block" disabled={isPending || connecting} onClick={() => connect({ connector: c })} data-testid="verifier-connect">
                {connecting || isPending ? "Connecting…" : `Connect ${c.id === "injected" ? "browser wallet" : c.name}`}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

/** Looks like any missing page, so the console's existence isn't advertised. */
function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-primary)" }} data-testid="not-found">
      <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
        <strong style={{ borderRight: "1px solid var(--border-light)", paddingRight: 16, marginRight: 16 }}>404</strong>
        This page could not be found.
      </p>
    </div>
  );
}
