import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode, useState } from "react";
import {
  Squares2X2Icon,
  ArchiveBoxIcon,
  CubeIcon,
  BanknotesIcon,
  DocumentTextIcon,
  ChartBarIcon,
  ArrowUpTrayIcon,
  ChartPieIcon,
  Bars3Icon,
  XMarkIcon,
  WalletIcon,
  ArrowsRightLeftIcon,
  HomeIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../../pages/_app";
import { connectWallet } from "../../lib/auth";

interface Props {
  children: ReactNode;
  userType: "farmer" | "investor";
}

const farmerNav = [
  { label: "Overview", icon: Squares2X2Icon, href: "/farmer/dashboard" },
  {
    label: "My Commodities",
    icon: ArchiveBoxIcon,
    href: "/farmer/commodities",
  },
  { label: "Tokenize", icon: CubeIcon, href: "/farmer/tokenize" },
  { label: "Borrow Funds", icon: BanknotesIcon, href: "/farmer/borrow" },
  { label: "My Loans", icon: DocumentTextIcon, href: "/farmer/loans" },
];

const investorNav = [
  { label: "Overview", icon: Squares2X2Icon, href: "/investor/dashboard" },
  { label: "Liquidity Pools", icon: ChartBarIcon, href: "/investor/pools" },
  { label: "Deposit", icon: ArrowUpTrayIcon, href: "/investor/deposit" },
  { label: "My Returns", icon: ChartPieIcon, href: "/investor/returns" },
];

function SidebarContent({
  userType,
  nav,
  accentColor,
  accentBg,
  onClose,
  onLogout,
}: {
  userType: "farmer" | "investor";
  nav: Array<{ label: string; icon: typeof Squares2X2Icon; href: string }>;
  accentColor: string;
  accentBg: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Logo */}
      <div
        style={{
          padding: "0 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "56px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              background: "var(--accent-green)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CubeIcon
              style={{ width: "16px", height: "16px", color: "#fff" }}
            />
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: "14px",
              color: "var(--text-primary)",
            }}
          >
            Agri<span style={{ color: "var(--accent-green)" }}>Bridge</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="mobile-close-btn"
          style={{
            display: "none",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            padding: "4px",
          }}
        >
          <XMarkIcon style={{ width: "20px", height: "20px" }} />
        </button>
      </div>

      {/* Badge */}
      <div style={{ padding: "16px 20px 8px" }}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
            color: accentColor,
            padding: "4px 10px",
            borderRadius: "4px",
            background: accentBg,
            display: "inline-block",
          }}
        >
          {userType === "farmer" ? "Farmer" : "Investor"}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "8px 12px", flex: 1, overflowY: "auto" }}>
        {nav.map((item) => {
          const active = router.pathname === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <div
                onClick={onClose}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  marginBottom: "2px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: active ? 600 : 400,
                  background: active ? accentBg : "transparent",
                  color: active ? accentColor : "var(--text-secondary)",
                  borderLeft: active
                    ? `2px solid ${accentColor}`
                    : "2px solid transparent",
                  textDecoration: "none",
                }}
              >
                <Icon
                  style={{ width: "16px", height: "16px", flexShrink: 0 }}
                />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div
        style={{
          padding: "12px",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <Link
          href={
            userType === "farmer" ? "/investor/dashboard" : "/farmer/dashboard"
          }
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "12px",
              color: "var(--text-muted)",
              padding: "8px 10px",
              borderRadius: "6px",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            <ArrowsRightLeftIcon style={{ width: "14px", height: "14px" }} />
            Switch to {userType === "farmer" ? "Investor" : "Farmer"}
          </div>
        </Link>
        <Link href="/">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "12px",
              color: "var(--text-muted)",
              padding: "8px 10px",
              borderRadius: "6px",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            <HomeIcon style={{ width: "14px", height: "14px" }} />
            Back to home
          </div>
        </Link>
        <button
          onClick={onLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "100%",
            fontSize: "12px",
            color: "var(--accent-red)",
            padding: "8px 10px",
            borderRadius: "6px",
            cursor: "pointer",
            background: "none",
            border: "none",
            textAlign: "left",
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children, userType }: Props) {
  const router = useRouter();
  const { profile, signOut, refreshProfile } = useAuth();
  const nav = userType === "farmer" ? farmerNav : investorNav;
  const accentColor =
    userType === "farmer" ? "var(--accent-green)" : "var(--accent-gold)";
  const accentBg =
    userType === "farmer" ? "var(--accent-green-bg)" : "var(--accent-gold-bg)";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const walletAddress = profile?.wallet_address || "";

  async function handleConnectWallet() {
    try {
      setConnectingWallet(true);
      await connectWallet();
      await refreshProfile();
    } catch (err) {
      console.error("Wallet connect failed:", err);
    } finally {
      setConnectingWallet(false);
    }
  }

  function handleLogout() {
    signOut();
    router.push("/");
  }

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-topbar-menu { display: flex !important; }
          .main-content { margin-left: 0 !important; }
          .mobile-overlay { display: ${sidebarOpen ? "block" : "none"} !important; }
          .mobile-sidebar { display: ${sidebarOpen ? "flex" : "none"} !important; }
          .mobile-close-btn { display: block !important; }
          .stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: "var(--bg-primary)",
        }}
      >
        {/* DESKTOP SIDEBAR */}
        <aside
          className="desktop-sidebar"
          style={{
            width: "220px",
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
          }}
        >
          <SidebarContent
            userType={userType}
            nav={nav}
            accentColor={accentColor}
            accentBg={accentBg}
            onClose={() => setSidebarOpen(false)}
            onLogout={handleLogout}
          />
        </aside>

        {/* MOBILE OVERLAY */}
        <div
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{
            display: "none",
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            zIndex: 40,
          }}
        />

        {/* MOBILE SIDEBAR */}
        <aside
          className="mobile-sidebar"
          style={{
            display: "none",
            flexDirection: "column",
            width: "240px",
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 50,
          }}
        >
          <SidebarContent
            userType={userType}
            nav={nav}
            accentColor={accentColor}
            accentBg={accentBg}
            onClose={() => setSidebarOpen(false)}
            onLogout={handleLogout}
          />
        </aside>

        {/* MAIN CONTENT */}
        <div
          className="main-content"
          style={{
            marginLeft: "220px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {/* TOPBAR */}
          <header
            style={{
              height: "56px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 20px",
              position: "sticky",
              top: 0,
              zIndex: 30,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                className="mobile-topbar-menu"
                onClick={() => setSidebarOpen(true)}
                style={{
                  display: "none",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  padding: "4px",
                  alignItems: "center",
                }}
              >
                <Bars3Icon style={{ width: "20px", height: "20px" }} />
              </button>
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                onClick={handleConnectWallet}
                disabled={connectingWallet}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-light)",
                  background: walletAddress
                    ? "var(--bg-card)"
                    : "var(--accent-green-bg)",
                  fontSize: "12px",
                  color: walletAddress
                    ? "var(--text-secondary)"
                    : "var(--accent-green)",
                  cursor: connectingWallet ? "not-allowed" : "pointer",
                  opacity: connectingWallet ? 0.7 : 1,
                }}
              >
                <WalletIcon style={{ width: "13px", height: "13px" }} />
                <span>
                  {connectingWallet
                    ? "Connecting..."
                    : walletAddress
                      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                      : "Connect Wallet"}
                </span>
              </button>
              <div
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  background: accentBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: accentColor,
                  border: `1px solid ${accentColor}40`,
                  flexShrink: 0,
                }}
              >
                {walletAddress
                  ? walletAddress.slice(2, 4).toUpperCase()
                  : userType === "farmer"
                    ? "F"
                    : "I"}
              </div>
            </div>
          </header>

          <main style={{ padding: "24px 20px", flex: 1 }}>{children}</main>
        </div>
      </div>
    </>
  );
}
