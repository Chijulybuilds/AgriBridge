import Head from "next/head";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseAbi, type Address } from "viem";
import { sepolia } from "viem/chains";
import { useConnect, useConnection, useConnectors } from "wagmi";
import { ArrowTopRightOnSquareIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

import { LogoMark } from "../../components/Logo";
import { NetworkGuard } from "../../components/NetworkGuard";
import { NotFound } from "../../components/NotFound";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Tabs } from "../../components/ui";
import { AdvancesTab } from "../../components/verifier/Advances";
import { ClearanceTab } from "../../components/verifier/Clearance";
import { CollectionsTab } from "../../components/verifier/Collections";
import { CropsTab } from "../../components/verifier/Crops";
import { IntakeTab } from "../../components/verifier/Intake";
import { PricesTab } from "../../components/verifier/Prices";
import { WarehousesTab } from "../../components/verifier/Warehouses";
import { publicClient } from "../../lib/chain";
import { VERIFIER_SAFE } from "../../lib/contracts/config";
import { shortAddress } from "../../lib/format";
import { activeChain } from "../../lib/wagmi";

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

const SAFE_ABI = parseAbi(["function getOwners() view returns (address[])"]);

/**
 * The verifier console. It is linked from nowhere, kept out of search engines,
 * and opens only when the connected wallet is the verifier Safe. One of the
 * Safe's owners connecting their own wallet is shown how to open it inside
 * Safe{Wallet}; anyone else sees the site's ordinary "page not found". That is
 * privacy, not security: the contracts accept these actions from the Safe alone.
 */
export default function Verifier() {
  const { address, isConnected, status } = useConnection();
  const isSafe = Boolean(VERIFIER_SAFE && address && address.toLowerCase() === VERIFIER_SAFE.toLowerCase());

  // Whether the connected wallet is one of the Safe's owners (a plain wallet on a local chain has none).
  const owners = useQuery({
    queryKey: ["safe-owners", VERIFIER_SAFE],
    enabled: Boolean(VERIFIER_SAFE && isConnected && !isSafe),
    retry: false,
    queryFn: () => publicClient.readContract({ address: VERIFIER_SAFE!, abi: SAFE_ABI, functionName: "getOwners" }),
  });
  const isOwner = Boolean(address && owners.data?.some((o) => o.toLowerCase() === address.toLowerCase()));

  let screen;
  if (!VERIFIER_SAFE) screen = <NotFound />;
  else if (!isConnected) screen = <ConnectScreen connecting={status === "connecting" || status === "reconnecting"} />;
  else if (isSafe) screen = <Console safe={address!} />;
  else if (owners.isLoading) screen = <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }} />;
  else if (isOwner) screen = <OwnerScreen owner={address!} safe={VERIFIER_SAFE} />;
  else screen = <NotFound />;

  return (
    <>
      <Head>
        <title>AgriBridge</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {screen}
    </>
  );
}

function Console({ safe }: { safe: string }) {
  const [tab, setTab] = useState<TabId>("intake");
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <header className="app-header" style={{ padding: "0 28px" }}>
        <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
          <LogoMark size={28} />
          <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>
            Verifier console
          </span>
        </div>
        <div className="row" style={{ marginLeft: "auto", gap: 8, flexWrap: "nowrap" }}>
          <span className="chip hide-mobile">{activeChain.name}</span>
          <span className="chip" title={safe} data-testid="verifier-safe">
            <ShieldCheckIcon style={{ width: 15, height: 15, color: "var(--accent-green)" }} />
            Safe {shortAddress(safe)}
          </span>
          <ThemeToggle />
        </div>
      </header>
      <main className="app-content" style={{ margin: "0 auto" }}>
        <div className="page-header">
          <span className="page-eyebrow">Warehouse team</span>
          <h1>Today&apos;s work</h1>
          <p>Every action here becomes a transaction from the Safe; inside Safe{"{"}Wallet{"}"} the owners confirm it.</p>
        </div>
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

/** Connect the Safe: automatic inside Safe{Wallet}; a browser wallet otherwise. */
function ConnectScreen({ connecting }: { connecting: boolean }) {
  const connectors = useConnectors();
  const { mutate: connect, isPending } = useConnect();
  const safeConnector = connectors.find((c) => c.id === "safe");

  // Inside Safe{Wallet} the page runs in an iframe; connect to the Safe straight away.
  useEffect(() => {
    if (safeConnector && typeof window !== "undefined" && window.parent !== window) connect({ connector: safeConnector });
  }, [safeConnector, connect]);

  return (
    <div className="field-rows" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-primary)", padding: 16 }}>
      <div className="card" style={{ maxWidth: 400, width: "100%", padding: 28, boxShadow: "var(--shadow-md)" }}>
        <LogoMark size={36} />
        <h1 style={{ fontSize: 22, margin: "14px 0 6px" }}>Connect</h1>
        <p className="text-secondary" style={{ marginBottom: 18, fontSize: 13.5 }}>
          Open this page from Safe{"{"}Wallet{"}"}, or connect the authorised wallet.
        </p>
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

/**
 * For one of the Safe's owners who connected their own wallet. Verifier actions
 * must come from the Safe, so the console runs inside Safe{Wallet}, where the
 * page is connected as the Safe and each action waits for the owners' signatures.
 */
function OwnerScreen({ owner, safe }: { owner: Address; safe: Address }) {
  const appUrl = typeof window !== "undefined" ? `${window.location.origin}/verifier` : "/verifier";
  const openInSafe =
    activeChain.id === sepolia.id
      ? `https://app.safe.global/apps/open?safe=sep:${safe}&appUrl=${encodeURIComponent(appUrl)}`
      : undefined;

  return (
    <div className="field-rows" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-primary)", padding: 16 }}>
      <div className="card" style={{ maxWidth: 520, width: "100%", padding: 30, boxShadow: "var(--shadow-md)" }} data-testid="owner-screen">
        <span className="stat-icon tone-green" style={{ width: 42, height: 42 }}>
          <ShieldCheckIcon />
        </span>
        <h1 style={{ fontSize: 24, margin: "16px 0 8px" }}>Open the console inside Safe{"{"}Wallet{"}"}</h1>
        <p className="text-secondary" style={{ marginBottom: 18 }}>
          Your wallet {shortAddress(owner)} is one of the verifier Safe&apos;s owners. Verifier actions have to come from the Safe
          itself, so the console runs inside Safe{"{"}Wallet{"}"}, where each action waits for the owners to confirm it.
        </p>
        <ol className="text-secondary" style={{ paddingLeft: 18, lineHeight: 1.9, marginBottom: 22, fontSize: 13.5 }}>
          <li>Open Safe{"{"}Wallet{"}"} with this wallet and pick the Safe {shortAddress(safe)}.</li>
          <li>
            In <strong>Apps → My custom apps</strong>, add <code>{appUrl}</code> (only the first time).
          </li>
          <li>Approve deliveries there; the other owner confirms each one.</li>
        </ol>
        {openInSafe ? (
          <a className="btn btn-block" href={openInSafe} target="_blank" rel="noreferrer">
            Open in Safe{"{"}Wallet{"}"} <ArrowTopRightOnSquareIcon />
          </a>
        ) : (
          <p className="muted">Safe{"{"}Wallet{"}"} works on Sepolia; this app is pointed at {activeChain.name}.</p>
        )}
      </div>
    </div>
  );
}
