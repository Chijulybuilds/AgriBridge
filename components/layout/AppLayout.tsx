import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState, type ReactNode } from "react";
import { useConnection } from "wagmi";
import {
  ArchiveBoxIcon,
  BanknotesIcon,
  Bars3Icon,
  BuildingStorefrontIcon,
  ChartBarSquareIcon,
  CubeIcon,
  DocumentTextIcon,
  HomeIcon,
  QueueListIcon,
  ScaleIcon,
  ShieldExclamationIcon,
  Squares2X2Icon,
  TagIcon,
  TruckIcon,
  WalletIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { REGULATOR_ROLE } from "../../lib/contracts/config";
import { usd } from "../../lib/format";
import { APP_ROLES, storeRole, type AppRole } from "../../lib/session";
import { useHasRegistryRole, useUsdc } from "../../hooks/useProtocolData";
import { DemoFaucet } from "../DemoFaucet";
import { Logo, LogoMark } from "../Logo";
import { NetworkGuard } from "../NetworkGuard";
import { RequireWallet } from "../RequireWallet";
import { ThemeToggle } from "../ThemeToggle";
import { AccountName, SignOut } from "../wallet";

type NavItem = { label: string; icon: typeof Squares2X2Icon; href: string };

const NAV: Record<AppRole, NavItem[]> = {
  farmer: [
    { label: "Overview", icon: Squares2X2Icon, href: "/farmer" },
    { label: "Deliver a crop", icon: TruckIcon, href: "/farmer/deliver" },
    { label: "My stock", icon: ArchiveBoxIcon, href: "/stock" },
    { label: "Get an advance", icon: BanknotesIcon, href: "/farmer/advance" },
    { label: "My advances", icon: DocumentTextIcon, href: "/farmer/loans" },
    { label: "Sell", icon: TagIcon, href: "/market/sell" },
    { label: "Market", icon: BuildingStorefrontIcon, href: "/market" },
  ],
  investor: [
    { label: "Overview", icon: Squares2X2Icon, href: "/investor" },
    { label: "Risk", icon: ScaleIcon, href: "/investor/risk" },
    { label: "Market", icon: BuildingStorefrontIcon, href: "/market" },
  ],
  buyer: [
    { label: "Market", icon: BuildingStorefrontIcon, href: "/market" },
    { label: "My stock", icon: ArchiveBoxIcon, href: "/stock" },
    { label: "Collect", icon: TruckIcon, href: "/stock/collect" },
    { label: "Sell", icon: TagIcon, href: "/market/sell" },
    { label: "Expired stock", icon: CubeIcon, href: "/market/clearance" },
  ],
};

/**
 * The signed-in app: a sidebar for the person's current role (farmer, investor
 * or buyer) with a switch between them, and a top bar with their balance.
 * Pages that anyone may see (the market) pass `requireWallet={false}`.
 */
export default function AppLayout({
  role,
  title,
  children,
  requireWallet = true,
}: {
  role: AppRole;
  title: string;
  children: ReactNode;
  requireWallet?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { address, isConnected } = useConnection();
  const { balance } = useUsdc(address);

  // Remember the role a person last used, so sign-in brings them back to it.
  useEffect(() => storeRole(role), [role]);

  const body = (
    <>
      <NetworkGuard />
      {children}
    </>
  );

  return (
    <>
      <Head>
        <title>{`${title} · AgriBridge`}</title>
      </Head>
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
        <aside className="app-sidebar desktop-sidebar">
          <Sidebar role={role} onNavigate={() => setMenuOpen(false)} />
        </aside>

        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(10, 20, 14, 0.45)", zIndex: 40 }}
            />
            <aside className="app-sidebar" style={{ zIndex: 50, boxShadow: "var(--shadow-lg)" }}>
              <Sidebar role={role} onNavigate={() => setMenuOpen(false)} closable />
            </aside>
          </>
        )}

        <div className="app-main">
          <header className="app-header">
            <button className="icon-btn mobile-topbar-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Bars3Icon style={{ width: 19, height: 19 }} />
            </button>
            <Link href="/" className="mobile-topbar-brand" aria-label="AgriBridge home">
              <LogoMark size={30} />
            </Link>
            <div className="row" style={{ marginLeft: "auto", gap: 8, flexWrap: "nowrap" }}>
              <DemoFaucet />
              {isConnected && (
                <span className="chip hide-mobile" data-testid="usdc-balance" title="Your dollars (USDC)">
                  <WalletIcon style={{ width: 15, height: 15, color: "var(--accent-green)" }} />
                  <span className="num">{usd(balance)}</span>
                </span>
              )}
              <ThemeToggle />
              {isConnected ? (
                <span className="chip" data-testid="account">
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-green-light)" }}
                  />
                  <AccountName />
                </span>
              ) : (
                <Link className="btn btn-small" href={`/login?role=${role}`}>
                  Sign in
                </Link>
              )}
            </div>
          </header>
          <main className="app-content">{requireWallet ? <RequireWallet>{body}</RequireWallet> : body}</main>
        </div>
      </div>
    </>
  );
}

function Sidebar({ role, onNavigate, closable }: { role: AppRole; onNavigate: () => void; closable?: boolean }) {
  const router = useRouter();
  const { address, isConnected } = useConnection();
  const { hasRole: isRegulator } = useHasRegistryRole(REGULATOR_ROLE, address);
  const nav = [
    ...NAV[role],
    { label: "Activity", icon: QueueListIcon, href: "/activity" },
    ...(isRegulator ? [{ label: "Regulator", icon: ShieldExclamationIcon, href: "/regulator" }] : []),
  ];

  return (
    <>
      <div className="spread" style={{ padding: "0 18px", height: 64, flexShrink: 0 }}>
        <Logo size={30} />
        {closable && (
          <button className="icon-btn" onClick={onNavigate} aria-label="Close menu">
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        )}
      </div>

      {/* Everyone can play every role; this switches which tools are shown. */}
      <div style={{ padding: "4px 14px 14px" }}>
        <div className="segmented" style={{ display: "flex" }} role="navigation" aria-label="Role">
          {APP_ROLES.map((r) => (
            <Link
              key={r.id}
              href={r.home}
              onClick={onNavigate}
              data-testid={`switch-to-${r.id}`}
              aria-current={r.id === role ? "true" : undefined}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "7px 0",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: "none",
                color: r.id === role ? "var(--accent-green)" : "var(--text-secondary)",
                background: r.id === role ? "var(--bg-card)" : "transparent",
                boxShadow: r.id === role ? "var(--shadow-sm)" : "none",
              }}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <nav style={{ padding: "0 12px", flex: 1, overflowY: "auto" }}>
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className="nav-item"
              aria-current={router.pathname === item.href ? "page" : undefined}
            >
              <Icon />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: 14, borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <Link href="/market" className="nav-item" onClick={onNavigate}>
          <ChartBarSquareIcon />
          Prices and stock
        </Link>
        <Link href="/" className="nav-item" onClick={onNavigate}>
          <HomeIcon />
          Home
        </Link>
        {isConnected && (
          <div className="card-sunken spread" style={{ marginTop: 10, padding: "10px 12px" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              <AccountName />
            </span>
            <SignOut className="link" />
          </div>
        )}
      </div>
    </>
  );
}
