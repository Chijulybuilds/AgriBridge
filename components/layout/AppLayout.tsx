import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState, type ReactNode } from "react";
import { useConnection } from "wagmi";
import {
  ArchiveBoxIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  Bars3Icon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  CubeIcon,
  DocumentTextIcon,
  HomeIcon,
  QueueListIcon,
  ScaleIcon,
  ShieldExclamationIcon,
  Squares2X2Icon,
  TagIcon,
  TruckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { REGULATOR_ROLE } from "../../lib/contracts/config";
import { usd } from "../../lib/format";
import { APP_ROLES, storeRole, type AppRole } from "../../lib/session";
import { useHasRegistryRole, useUsdc } from "../../hooks/useProtocolData";
import { DemoFaucet } from "../DemoFaucet";
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

const ACCENT: Record<AppRole, { color: string; bg: string }> = {
  farmer: { color: "var(--accent-green)", bg: "var(--accent-green-bg)" },
  investor: { color: "var(--accent-gold)", bg: "var(--accent-gold-bg)" },
  buyer: { color: "var(--accent-blue)", bg: "var(--accent-blue-bg)" },
};

/**
 * The signed-in app: a sidebar for the person's current role (farmer, investor
 * or buyer), a switch to the other roles, and a top bar with their balance.
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
      <style>{`
        @media (max-width: 768px) {
          .mobile-overlay { display: ${menuOpen ? "block" : "none"} !important; }
          .mobile-sidebar { display: ${menuOpen ? "flex" : "none"} !important; }
        }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
        <aside className="desktop-sidebar" style={sidebarStyle}>
          <Sidebar role={role} onNavigate={() => setMenuOpen(false)} />
        </aside>
        <div className="mobile-overlay" onClick={() => setMenuOpen(false)} style={overlayStyle} />
        <aside className="mobile-sidebar" style={{ ...sidebarStyle, display: "none", zIndex: 50, width: 240 }}>
          <Sidebar role={role} onNavigate={() => setMenuOpen(false)} />
        </aside>

        <div className="main-content" style={{ marginLeft: 220, flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header style={headerStyle}>
            <button
              className="mobile-topbar-menu"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              style={{ display: "none", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
            >
              <Bars3Icon style={{ width: 20, height: 20 }} />
            </button>
            <div className="row" style={{ marginLeft: "auto" }}>
              <DemoFaucet />
              {isConnected && (
                <span className="muted hide-mobile" data-testid="usdc-balance">
                  Balance <strong style={{ color: "var(--text-primary)" }}>{usd(balance)}</strong>
                </span>
              )}
              <ThemeToggle variant="minimal" />
              {isConnected ? (
                <span className="badge badge-muted" data-testid="account">
                  <AccountName />
                </span>
              ) : (
                <Link className="btn btn-small" href={`/login?role=${role}`}>
                  Sign in
                </Link>
              )}
            </div>
          </header>
          <main style={{ padding: "24px 20px", flex: 1 }}>
            {requireWallet ? <RequireWallet>{body}</RequireWallet> : body}
          </main>
        </div>
      </div>
    </>
  );
}

function Sidebar({ role, onNavigate }: { role: AppRole; onNavigate: () => void }) {
  const router = useRouter();
  const { address, isConnected } = useConnection();
  const { hasRole: isRegulator } = useHasRegistryRole(REGULATOR_ROLE, address);
  const accent = ACCENT[role];
  const nav = [
    ...NAV[role],
    { label: "Activity", icon: QueueListIcon, href: "/activity" },
    ...(isRegulator ? [{ label: "Regulator", icon: ShieldExclamationIcon, href: "/regulator" }] : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="spread" style={{ padding: "0 20px", height: 56, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Link href="/" className="row" style={{ gap: 8, textDecoration: "none", color: "var(--text-primary)" }}>
          <span style={logoStyle}>
            <CubeIcon style={{ width: 16, height: 16, color: "#fff" }} />
          </span>
          <strong>
            Agri<span style={{ color: "var(--accent-green)" }}>Bridge</span>
          </strong>
        </Link>
        <button className="mobile-close-btn" onClick={onNavigate} aria-label="Close menu" style={closeStyle}>
          <XMarkIcon style={{ width: 20, height: 20 }} />
        </button>
      </div>

      <div style={{ padding: "16px 20px 8px" }}>
        <span className="badge" style={{ background: accent.bg, color: accent.color, textTransform: "uppercase", letterSpacing: 0.8 }}>
          {APP_ROLES.find((r) => r.id === role)?.label}
        </span>
      </div>

      <nav style={{ padding: "8px 12px", flex: 1, overflowY: "auto" }}>
        {nav.map((item) => {
          const active = router.pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                marginBottom: 2,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                background: active ? accent.bg : "transparent",
                color: active ? accent.color : "var(--text-secondary)",
                borderLeft: `2px solid ${active ? accent.color : "transparent"}`,
                textDecoration: "none",
              }}
            >
              <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: 12, borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        {APP_ROLES.filter((r) => r.id !== role).map((other) => (
          <Link key={other.id} href={other.home} onClick={onNavigate} style={footerLinkStyle} data-testid={`switch-to-${other.id}`}>
            <ArrowsRightLeftIcon style={{ width: 14, height: 14 }} />
            Switch to {other.label}
          </Link>
        ))}
        <Link href="/" style={footerLinkStyle}>
          <HomeIcon style={{ width: 14, height: 14 }} />
          Home
        </Link>
        <Link href="/market" style={footerLinkStyle}>
          <ChartBarIcon style={{ width: 14, height: 14 }} />
          Prices and stock
        </Link>
        {isConnected && <SignOut className="link" />}
      </div>
    </div>
  );
}

const sidebarStyle: React.CSSProperties = {
  width: 220,
  flexShrink: 0,
  borderRight: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  flexDirection: "column",
};

const overlayStyle: React.CSSProperties = {
  display: "none",
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.3)",
  zIndex: 40,
};

const headerStyle: React.CSSProperties = {
  height: 56,
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  display: "flex",
  alignItems: "center",
  padding: "0 20px",
  gap: 12,
  position: "sticky",
  top: 0,
  zIndex: 30,
};

const logoStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  background: "var(--accent-green)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const closeStyle: React.CSSProperties = {
  display: "none",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--text-muted)",
};

const footerLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "var(--text-muted)",
  padding: "7px 10px",
  textDecoration: "none",
};
