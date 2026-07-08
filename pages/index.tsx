import {
  GlobeAltIcon,
  CubeIcon,
  BanknotesIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";
import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Kept from File 1: dashboards need an authenticated wallet, so nav/hero/CTA
  // buttons all route through /login instead of linking straight to a dashboard.
  function handleConnect(role: "farmer" | "investor") {
    setLoading(true);
    router.push(`/login?role=${role}`);
  }

  function handleWalletConnect() {
    setLoading(true);
    router.push("/login");
  }

  return (
    <>
      <Head>
        <title>AgriBridge — Decentralized Agri-Finance</title>
      </Head>

      <main style={{ background: "var(--bg-primary)", minHeight: "100vh" }}>
        {/* NAV */}
        <nav
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            borderBottom: "1px solid var(--border)",
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(12px)",
            padding: "0 24px",
            height: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
            }}
          >
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
                fontSize: "15px",
                color: "var(--text-primary)",
                letterSpacing: "-0.3px",
              }}
            >
              Agri<span style={{ color: "var(--accent-green)" }}>Bridge</span>
            </span>
          </div>

          <div
            className="nav-links"
            style={{ display: "flex", alignItems: "center", gap: "24px" }}
          >
            {["Features", "How it works"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(" ", "-")}`}
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                {item}
              </a>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            <button
              onClick={handleWalletConnect}
              disabled={loading}
              style={{
                padding: "7px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                border: "1px solid var(--border-light)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 500,
                whiteSpace: "nowrap",
                opacity: loading ? 0.7 : 1,
              }}
            >
              Connect Wallet
            </button>
            <button
              onClick={() => handleConnect("farmer")}
              disabled={loading}
              style={{
                padding: "7px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                border: "1px solid var(--border-light)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 500,
                whiteSpace: "nowrap",
                opacity: loading ? 0.7 : 1,
              }}
            >
              Farmer
            </button>
            <button
              onClick={() => handleConnect("investor")}
              disabled={loading}
              style={{
                padding: "7px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                background: "var(--accent-green)",
                border: "none",
                color: "#ffffff",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 600,
                whiteSpace: "nowrap",
                opacity: loading ? 0.7 : 1,
              }}
            >
              Investor
            </button>
          </div>
        </nav>

        {/* HERO — File 2's bigger, more cinematic hero treatment */}
        <section
          style={{
            position: "relative",
            minHeight: "100vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          <video
            autoPlay
            muted
            loop
            playsInline
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              zIndex: 0,
            }}
          >
            <source src="/videos/3826309911-preview.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>

          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(0,0,0,0.55)",
              zIndex: 1,
            }}
          />

          <div
            style={{
              position: "relative",
              zIndex: 2,
              maxWidth: "900px",
              padding: "0 24px",
              color: "#ffffff",
            }}
          >
            <h1
              style={{
                fontSize: "64px",
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-2px",
                marginBottom: "24px",
                color: "#ffffff",
                textShadow: "0 3px 20px rgba(0,0,0,.6)",
              }}
            >
              Agriculture Meets
              <br />
              <span style={{ color: "#67E8A5" }}>Decentralized Finance</span>
            </h1>

            <p
              style={{
                fontSize: "20px",
                color: "#F3F4F6",
                maxWidth: "650px",
                margin: "0 auto 40px",
                lineHeight: 1.8,
                textShadow: "0 2px 10px rgba(0,0,0,.5)",
              }}
            >
              AgriBridge lets farmers tokenize real-world commodities and access
              instant liquidity, while investors earn transparent returns.
            </p>

            <div
              style={{
                display: "flex",
                gap: "14px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => handleConnect("farmer")}
                disabled={loading}
                style={{
                  padding: "14px 30px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#22C55E",
                  color: "#ffffff",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: "15px",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Connecting..." : "I'm a Farmer →"}
              </button>

              <button
                onClick={() => handleConnect("investor")}
                disabled={loading}
                style={{
                  padding: "14px 30px",
                  borderRadius: "10px",
                  border: "1px solid #ffffff",
                  background: "transparent",
                  color: "#ffffff",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: "15px",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Connecting..." : "I'm an Investor →"}
              </button>
            </div>
          </div>
        </section>

        {/* STATS — kept from File 1, File 2 dropped this entirely */}
        <section
          style={{
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-secondary)",
          }}
        >
          <div
            className="stats-inner"
            style={{
              maxWidth: "900px",
              margin: "0 auto",
              padding: "36px 24px",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
            }}
          >
            {[
              { label: "Total Value Locked", value: "$2.4M" },
              { label: "Active Farmers", value: "1,240" },
              { label: "Commodities Tokenized", value: "3,800+" },
              { label: "Avg Investor APY", value: "9.2%" },
            ].map((s, i) => (
              <div
                key={s.label}
                style={{
                  textAlign: "center",
                  padding: "8px 16px",
                  borderRight: i < 3 ? "1px solid var(--border)" : "none",
                }}
              >
                <div
                  style={{
                    fontSize: "26px",
                    fontWeight: 800,
                    color: "var(--accent-green)",
                    letterSpacing: "-0.5px",
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginTop: "4px",
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES — File 2's card styling, duplicate eyebrow/heading pair removed */}
        <section
          id="features"
          style={{ maxWidth: "900px", margin: "0 auto", padding: "80px 24px" }}
        >
          <div style={{ marginBottom: "48px" }}>
            <p
              style={{
                fontSize: "12px",
                color: "var(--accent-green)",
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                marginBottom: "12px",
              }}
            >
              Why AgriBridge
            </p>

            <h2
              style={{
                fontSize: "46px",
                fontWeight: 800,
                lineHeight: 1.15,
                marginBottom: "18px",
                color: "var(--text-primary)",
              }}
            >
              The Future of
              <br />
              Agricultural Finance
            </h2>

            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "17px",
                maxWidth: "700px",
                lineHeight: 1.8,
              }}
            >
              AgriBridge connects verified agricultural assets with
              decentralized finance, giving farmers instant access to funding
              while providing investors with secure, transparent opportunities
              backed by real-world commodities.
            </p>
          </div>

          <div
            className="features-inner-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            {[
              {
                icon: CubeIcon,
                title: "Real Assets. Real Value.",
                desc: "Every lending pool is backed by verified agricultural commodities stored with trusted warehouse partners, giving investors confidence and farmers credibility.",
              },
              {
                icon: BanknotesIcon,
                title: "Instant Liquidity",
                desc: "Farmers can unlock financing within minutes by using tokenized commodities as collateral instead of waiting months after harvest.",
              },
              {
                icon: ChartBarIcon,
                title: "Consistent Investor Returns",
                desc: "Invest in carefully managed lending pools, monitor performance live, and earn transparent returns backed by productive agricultural assets.",
              },
              {
                icon: ShieldCheckIcon,
                title: "Smart Risk Protection",
                desc: "Oracle price feeds continuously monitor collateral health, helping reduce risk while maintaining healthy lending positions.",
              },
              {
                icon: GlobeAltIcon,
                title: "Global Agricultural Marketplace",
                desc: "Farmers, cooperatives, exporters, and investors participate together on one secure blockchain-powered platform.",
              },
              {
                icon: BoltIcon,
                title: "Powered by Smart Contracts",
                desc: "Every loan, repayment, collateral update, and investor reward is automated, transparent, and permanently recorded on-chain.",
              },
            ].map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  style={{
                    padding: "32px 28px",
                    borderRight:
                      (i + 1) % 3 !== 0 ? "1px solid var(--border)" : "none",
                    borderBottom: i < 3 ? "1px solid var(--border)" : "none",
                    background:
                      "linear-gradient(180deg,#ffffff 0%,#f8fbf9 100%)",
                    transition: "all .35s ease",
                    cursor: "pointer",
                    boxShadow: "0 10px 30px rgba(34,197,94,.06)",
                  }}
                >
                  <div
                    style={{
                      width: "60px",
                      height: "60px",
                      borderRadius: "16px",
                      background: "var(--accent-green-bg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: "22px",
                    }}
                  >
                    <Icon
                      style={{
                        width: "30px",
                        height: "30px",
                        color: "var(--accent-green)",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: "14px",
                    }}
                  >
                    {f.title}
                  </div>
                  <div
                    style={{
                      fontSize: "15px",
                      color: "var(--text-secondary)",
                      lineHeight: 1.8,
                    }}
                  >
                    {f.desc}
                    <div
                      style={{
                        marginTop: "22px",
                        display: "flex",
                        alignItems: "center",
                        color: "var(--accent-green)",
                        fontWeight: 700,
                        fontSize: "14px",
                      }}
                    >
                      Learn More <span style={{ marginLeft: "8px" }}>→</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Investor CTA banner from File 2 — button now goes through the wallet-connect flow */}
          <div
            style={{
              marginTop: "70px",
              textAlign: "center",
              padding: "45px",
              background: "linear-gradient(135deg,#1E3A2F,#2E7D32)",
              borderRadius: "16px",
              color: "#fff",
            }}
          >
            <h3
              style={{
                fontSize: "30px",
                fontWeight: 800,
                marginBottom: "18px",
              }}
            >
              Invest in Agriculture. Empower Farmers.
            </h3>
            <p
              style={{
                maxWidth: "650px",
                margin: "0 auto 28px",
                lineHeight: 1.8,
                color: "#E8F5E9",
              }}
            >
              Join a transparent financial ecosystem where every investment
              supports real agricultural productivity while creating sustainable
              returns for everyone involved.
            </p>
            <button
              onClick={() => handleConnect("investor")}
              disabled={loading}
              style={{
                padding: "15px 36px",
                borderRadius: "10px",
                border: "none",
                background: "#ffffff",
                color: "#1B5E20",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "16px",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Connecting..." : "Explore Investment Opportunities →"}
            </button>
          </div>
        </section>

        {/* HOW IT WORKS — identical in both files, kept as-is */}
        <section
          id="how-it-works"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--bg-secondary)",
          }}
        >
          <div
            style={{
              maxWidth: "900px",
              margin: "0 auto",
              padding: "80px 24px",
            }}
          >
            <div style={{ marginBottom: "48px" }}>
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--accent-green)",
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  marginBottom: "10px",
                }}
              >
                The Process
              </p>
              <h2
                style={{
                  fontSize: "32px",
                  fontWeight: 800,
                  letterSpacing: "-0.8px",
                  color: "var(--text-primary)",
                }}
              >
                How AgriBridge works
              </h2>
            </div>

            <div
              className="how-it-works-inner"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "64px",
              }}
            >
              {[
                {
                  label: "For Farmers",
                  color: "var(--accent-green)",
                  steps: [
                    [
                      "Deposit Commodity",
                      "Store goods in a verified warehouse partner.",
                    ],
                    [
                      "Tokenize Asset",
                      "Commodity is minted as an on-chain token.",
                    ],
                    [
                      "Borrow Against It",
                      "Use tokens as collateral for a USDC loan.",
                    ],
                    [
                      "Repay & Reclaim",
                      "Repay with interest, tokens returned to you.",
                    ],
                  ],
                },
                {
                  label: "For Investors",
                  color: "var(--accent-gold)",
                  steps: [
                    ["Connect Wallet", "Link MetaMask or any Web3 wallet."],
                    ["Choose a Pool", "Browse pools by APY and risk profile."],
                    [
                      "Deposit Funds",
                      "Provide USDC liquidity to your chosen pool.",
                    ],
                    [
                      "Earn Returns",
                      "Earn interest as farmers borrow from your pool.",
                    ],
                  ],
                },
              ].map((side) => (
                <div key={side.label}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: side.color,
                      marginBottom: "24px",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                    }}
                  >
                    {side.label}
                  </div>
                  {side.steps.map(([title, desc], i) => (
                    <div
                      key={title}
                      style={{
                        display: "flex",
                        gap: "14px",
                        marginBottom: "4px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: "26px",
                            height: "26px",
                            borderRadius: "50%",
                            border: `1.5px solid ${side.color}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: side.color,
                            background: "var(--bg-primary)",
                            flexShrink: 0,
                          }}
                        >
                          {i + 1}
                        </div>
                        {i < 3 && (
                          <div
                            style={{
                              width: "1px",
                              height: "28px",
                              background: "var(--border)",
                              margin: "3px 0",
                            }}
                          />
                        )}
                      </div>
                      <div style={{ paddingBottom: "12px" }}>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            marginBottom: "3px",
                          }}
                        >
                          {title}
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                            lineHeight: 1.5,
                          }}
                        >
                          {desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            padding: "80px 24px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: "36px",
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: "14px",
              color: "var(--text-primary)",
            }}
          >
            Ready to get started?
          </h2>
          <p
            style={{
              color: "var(--text-secondary)",
              marginBottom: "32px",
              fontSize: "15px",
            }}
          >
            Join thousands of farmers and investors already using AgriBridge.
          </p>
          <div
            className="cta-buttons"
            style={{ display: "flex", gap: "10px", justifyContent: "center" }}
          >
            <button
              onClick={() => handleConnect("farmer")}
              disabled={loading}
              style={{
                padding: "11px 24px",
                borderRadius: "8px",
                fontSize: "14px",
                background: "var(--accent-green)",
                border: "none",
                color: "#ffffff",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 600,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Connecting..." : "Start as Farmer"}
            </button>
            <button
              onClick={() => handleConnect("investor")}
              disabled={loading}
              style={{
                padding: "11px 24px",
                borderRadius: "8px",
                fontSize: "14px",
                background: "transparent",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 500,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Connecting..." : "Start as Investor"}
            </button>
          </div>
        </section>

        {/* FOOTER */}
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            padding: "24px 32px",
          }}
        >
          <div
            className="footer-inner"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
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
          </div>
        </footer>
      </main>
    </>
  );
}
