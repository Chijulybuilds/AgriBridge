import {
    GlobeAltIcon,
    CubeIcon,
    BanknotesIcon,
    ChartBarIcon,
    ShieldCheckIcon,
    BoltIcon,
    SparklesIcon,
    ArrowRightIcon,
} from "@heroicons/react/24/outline";
import Head from "next/head";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { useAccount } from "wagmi";

// Animated background elements for visual depth
const AnimatedBackground = () => (
    <div
        style={{
            position: "fixed",
            inset: 0,
            background: "linear-gradient(135deg, #0f3f22 0%, #1a5f3f 50%, #0d2818 100%)",
            zIndex: 0,
            overflow: "hidden",
        }}
    >
        {/* Animated gradient orbs */}
        {[
            { top: "-50%", left: "-50%", delay: 0 },
            { top: "50%", right: "-50%", delay: 2 },
            { bottom: "-50%", left: "30%", delay: 4 },
        ].map((pos, i) => (
            <div
                key={i}
                style={{
                    position: "absolute",
                    width: "600px",
                    height: "600px",
                    borderRadius: "50%",
                    background: `radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)`,
                    filter: "blur(80px)",
                    animation: `float 8s ease-in-out ${pos.delay}s infinite`,
                    ...pos,
                } as React.CSSProperties}
            />
        ))}

        <style>{`
      @keyframes float {
        0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
        50% { transform: translate(100px, -100px) scale(1.1); opacity: 0.8; }
      }
      @keyframes slideInUp {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes slideInLeft {
        from { opacity: 0; transform: translateX(-30px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes slideInRight {
        from { opacity: 0; transform: translateX(30px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      @keyframes glow {
        0%, 100% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.3); }
        50% { box-shadow: 0 0 40px rgba(34, 197, 94, 0.6); }
      }
      .hero-title { animation: slideInUp 0.8s ease-out; }
      .hero-subtitle { animation: slideInUp 0.8s ease-out 0.2s both; }
      .hero-cta { animation: slideInUp 0.8s ease-out 0.4s both; }
      .metric-card { animation: slideInUp 0.6s ease-out; }
      .feature-card { animation: slideInUp 0.6s ease-out; }
    `}</style>
    </div>
);

// Metric card showing real-time data
const MetricCard = ({
    label,
    value,
    unit,
    trend,
    index,
}: {
    label: string;
    value: string;
    unit?: string;
    trend?: string;
    index: number;
}) => (
    <div
        className="metric-card"
        style={{
            background: "rgba(15, 63, 34, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(34, 197, 94, 0.2)",
            borderRadius: "16px",
            padding: "24px",
            minWidth: "160px",
            animationDelay: `${index * 0.15}s`,
        }}
    >
        <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "12px", fontWeight: 600 }}>
            {label}
        </div>
        <div
            style={{
                fontSize: "32px",
                fontWeight: 800,
                color: "#22c55e",
                marginBottom: "4px",
                fontFamily: "monospace",
            }}
        >
            {value}
            {unit && <span style={{ fontSize: "16px", marginLeft: "4px" }}>{unit}</span>}
        </div>
        {trend && (
            <div
                style={{
                    fontSize: "12px",
                    color: trend.startsWith("+") ? "#22c55e" : "#ef4444",
                    marginTop: "8px",
                }}
            >
                {trend}
            </div>
        )}
    </div>
);

// Feature card with icon
const FeatureCard = ({
    icon: Icon,
    title,
    description,
    index,
}: {
    icon: React.ComponentType<{ style?: React.CSSProperties }>;
    title: string;
    description: string;
    index: number;
}) => (
    <div
        className="feature-card"
        style={{
            background: "rgba(15, 63, 34, 0.4)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(34, 197, 94, 0.15)",
            borderRadius: "20px",
            padding: "32px",
            transition: "all 0.3s ease",
            animationDelay: `${index * 0.1}s`,
            cursor: "pointer",
        }}
        onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.background = "rgba(15, 63, 34, 0.6)";
            el.style.border = "1px solid rgba(34, 197, 94, 0.3)";
            el.style.transform = "translateY(-4px)";
        }}
        onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.background = "rgba(15, 63, 34, 0.4)";
            el.style.border = "1px solid rgba(34, 197, 94, 0.15)";
            el.style.transform = "translateY(0)";
        }}
    >
        <div
            style={{
                width: "48px",
                height: "48px",
                background: "linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.05))",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
            }}
        >
            <Icon style={{ width: "28px", height: "28px", color: "#22c55e" }} />
        </div>
        <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "#f1f5f9" }}>
            {title}
        </h3>
        <p style={{ fontSize: "14px", color: "#cbd5e1", lineHeight: "1.6" }}>{description}</p>
    </div>
);

export default function Home() {
    const router = useRouter();
    const { isConnected } = useAccount();
    const [loading, setLoading] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

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
                <title>AgriBridge — Smart Farming Finance</title>
                <meta
                    name="description"
                    content="Tokenize agricultural commodities and access instant financing. Farmers borrow, investors earn."
                />
                <meta property="og:title" content="AgriBridge — Smart Farming Finance" />
                <meta
                    property="og:description"
                    content="Decentralized platform for agricultural finance. Tokenize crops, access liquidity instantly."
                />
            </Head>

            <AnimatedBackground />

            <main style={{ position: "relative", zIndex: 10, minHeight: "100vh" }}>
                {/* NAVIGATION */}
                <nav
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        borderBottom: `1px solid ${scrolled ? "rgba(34, 197, 94, 0.2)" : "transparent"}`,
                        background: scrolled
                            ? "rgba(15, 23, 42, 0.8)"
                            : "rgba(15, 23, 42, 0.4)",
                        backdropFilter: "blur(12px)",
                        padding: "0 32px",
                        height: "64px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "all 0.3s ease",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                            style={{
                                width: "40px",
                                height: "40px",
                                borderRadius: "10px",
                                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: "0 8px 16px rgba(34, 197, 94, 0.3)",
                            }}
                        >
                            <SparklesIcon style={{ width: "24px", height: "24px", color: "#fff" }} />
                        </div>
                        <span
                            style={{
                                fontWeight: 800,
                                fontSize: "18px",
                                background: "linear-gradient(135deg, #f1f5f9 0%, #22c55e 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                letterSpacing: "-0.5px",
                            }}
                        >
                            AgriBridge
                        </span>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "32px",
                            fontSize: "14px",
                            fontWeight: 500,
                        }}
                    >
                        {["Features", "How It Works", "Security", "Pricing"].map((item) => (
                            <a
                                key={item}
                                href={`#${item.toLowerCase().replace(" ", "-")}`}
                                style={{
                                    color: "#cbd5e1",
                                    textDecoration: "none",
                                    transition: "color 0.3s ease",
                                    cursor: "pointer",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "#22c55e")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
                            >
                                {item}
                            </a>
                        ))}
                    </div>

                    <button
                        onClick={handleWalletConnect}
                        disabled={loading}
                        style={{
                            background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "8px",
                            padding: "10px 24px",
                            fontWeight: 600,
                            fontSize: "14px",
                            cursor: loading ? "not-allowed" : "pointer",
                            transition: "all 0.3s ease",
                            opacity: loading ? 0.7 : 1,
                        }}
                        onMouseEnter={(e) => {
                            if (!loading) e.currentTarget.style.transform = "translateY(-2px)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                        }}
                    >
                        {loading ? "Connecting..." : "Launch App"}
                    </button>
                </nav>

                {/* HERO SECTION */}
                <section
                    style={{
                        minHeight: "100vh",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "120px 40px 80px",
                        textAlign: "center",
                        position: "relative",
                        overflow: "hidden",
                    }}
                >
                    {/* Decorative elements */}
                    <div
                        style={{
                            position: "absolute",
                            top: "10%",
                            right: "5%",
                            width: "300px",
                            height: "300px",
                            background: "radial-gradient(circle, rgba(34, 197, 94, 0.1), transparent)",
                            borderRadius: "50%",
                            filter: "blur(40px)",
                            pointerEvents: "none",
                        }}
                    />

                    <div className="hero-title" style={{ marginBottom: "24px" }}>
                        <h1
                            style={{
                                fontSize: "64px",
                                fontWeight: 900,
                                color: "#f1f5f9",
                                lineHeight: "1.2",
                                marginBottom: "16px",
                            }}
                        >
                            Smart Farming{" "}
                            <span
                                style={{
                                    background: "linear-gradient(135deg, #22c55e 0%, #84cc16 100%)",
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                }}
                            >
                                Starts Here
                            </span>
                        </h1>
                        <p
                            style={{
                                fontSize: "16px",
                                color: "#cbd5e1",
                                maxWidth: "600px",
                                margin: "0 auto",
                                lineHeight: "1.8",
                            }}
                        >
                            Tokenize your harvest, secure instant financing, and grow your farm. AgriBridge
                            connects farmers with investors through blockchain-backed agriculture.
                        </p>
                    </div>

                    {/* CTA Buttons */}
                    <div
                        className="hero-cta"
                        style={{
                            display: "flex",
                            gap: "16px",
                            justifyContent: "center",
                            marginBottom: "80px",
                            flexWrap: "wrap",
                        }}
                    >
                        <button
                            onClick={() => handleConnect("farmer")}
                            disabled={loading}
                            style={{
                                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                                color: "#fff",
                                border: "none",
                                borderRadius: "12px",
                                padding: "16px 40px",
                                fontSize: "16px",
                                fontWeight: 700,
                                cursor: loading ? "not-allowed" : "pointer",
                                transition: "all 0.3s ease",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                opacity: loading ? 0.7 : 1,
                            }}
                            onMouseEnter={(e) => {
                                if (!loading) e.currentTarget.style.transform = "translateY(-4px)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                        >
                            I'm a Farmer <ArrowRightIcon style={{ width: "20px", height: "20px" }} />
                        </button>
                        <button
                            onClick={() => handleConnect("investor")}
                            disabled={loading}
                            style={{
                                background: "rgba(34, 197, 94, 0.1)",
                                color: "#22c55e",
                                border: "2px solid rgba(34, 197, 94, 0.3)",
                                borderRadius: "12px",
                                padding: "14px 40px",
                                fontSize: "16px",
                                fontWeight: 700,
                                cursor: loading ? "not-allowed" : "pointer",
                                transition: "all 0.3s ease",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                            }}
                            onMouseEnter={(e) => {
                                if (!loading) {
                                    e.currentTarget.style.background = "rgba(34, 197, 94, 0.15)";
                                    e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.5)";
                                    e.currentTarget.style.transform = "translateY(-4px)";
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "rgba(34, 197, 94, 0.1)";
                                e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.3)";
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                        >
                            I'm an Investor <ArrowRightIcon style={{ width: "20px", height: "20px" }} />
                        </button>
                    </div>

                    {/* Live Metrics */}
                    <div
                        style={{
                            display: "flex",
                            gap: "20px",
                            justifyContent: "center",
                            flexWrap: "wrap",
                            maxWidth: "900px",
                        }}
                    >
                        <MetricCard label="Yield Efficiency" value="84" unit="%" trend="↑ 8% last month" index={0} />
                        <MetricCard label="Crop Health" value="92" unit="%" trend="↑ 5% last month" index={1} />
                        <MetricCard
                            label="Water Optimization"
                            value="37"
                            unit="%"
                            trend="↑ 12% last month"
                            index={2}
                        />
                        <MetricCard label="Loan APY" value="12" unit="%" trend="↑ 2% last month" index={3} />
                    </div>
                </section>

                {/* FEATURES SECTION */}
                <section
                    id="features"
                    style={{
                        padding: "120px 40px",
                        maxWidth: "1400px",
                        margin: "0 auto",
                        width: "100%",
                    }}
                >
                    <div style={{ textAlign: "center", marginBottom: "80px" }}>
                        <h2
                            style={{
                                fontSize: "48px",
                                fontWeight: 900,
                                color: "#f1f5f9",
                                marginBottom: "16px",
                            }}
                        >
                            Why Choose AgriBridge?
                        </h2>
                        <p style={{ fontSize: "16px", color: "#cbd5e1", maxWidth: "600px", margin: "0 auto" }}>
                            Industrial-grade solutions for modern agriculture, powered by blockchain and smart
                            contracts.
                        </p>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                            gap: "24px",
                        }}
                    >
                        <FeatureCard
                            icon={BanknotesIcon}
                            title="Instant Financing"
                            description="Access funds in minutes by tokenizing your harvest. No lengthy approval processes."
                            index={0}
                        />
                        <FeatureCard
                            icon={ShieldCheckIcon}
                            title="Secure & Verified"
                            description="Third-party verifiers authenticate every commodity on-chain. Complete transparency."
                            index={1}
                        />
                        <FeatureCard
                            icon={ChartBarIcon}
                            title="Transparent Returns"
                            description="Investors earn predictable interest rates backed by real commodity collateral."
                            index={2}
                        />
                        <FeatureCard
                            icon={BoltIcon}
                            title="Smart Liquidation"
                            description="Automated health checks prevent over-borrowing. Investors always protected."
                            index={3}
                        />
                        <FeatureCard
                            icon={GlobeAltIcon}
                            title="Global Market"
                            description="Connect with investors worldwide. Access capital beyond local boundaries."
                            index={4}
                        />
                        <FeatureCard
                            icon={CubeIcon}
                            title="ERC-1155 Tokens"
                            description="Each commodity is a unique digital asset. Full portability and composability."
                            index={5}
                        />
                    </div>
                </section>

                {/* HOW IT WORKS */}
                <section
                    id="how-it-works"
                    style={{
                        padding: "120px 40px",
                        background: "rgba(15, 63, 34, 0.3)",
                        borderTop: "1px solid rgba(34, 197, 94, 0.1)",
                        borderBottom: "1px solid rgba(34, 197, 94, 0.1)",
                    }}
                >
                    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
                        <div style={{ textAlign: "center", marginBottom: "80px" }}>
                            <h2
                                style={{
                                    fontSize: "48px",
                                    fontWeight: 900,
                                    color: "#f1f5f9",
                                    marginBottom: "16px",
                                }}
                            >
                                How It Works
                            </h2>
                            <p style={{ fontSize: "16px", color: "#cbd5e1", maxWidth: "600px", margin: "0 auto" }}>
                                A simple four-step process from harvest to capital in your pocket.
                            </p>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px" }}>
                            {[
                                { num: "01", title: "Register Harvest", desc: "Record your commodity on-chain with details" },
                                { num: "02", title: "Get Verified", desc: "Third-party verifier approves your harvest" },
                                { num: "03", title: "Tokenize", desc: "Receive ERC-1155 collateral tokens" },
                                { num: "04", title: "Borrow", desc: "Deposit tokens and borrow stablecoins instantly" },
                            ].map((step, i) => (
                                <div
                                    key={i}
                                    style={{
                                        padding: "32px",
                                        background: "rgba(15, 63, 34, 0.5)",
                                        border: "1px solid rgba(34, 197, 94, 0.2)",
                                        borderRadius: "16px",
                                        transition: "all 0.3s ease",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = "rgba(15, 63, 34, 0.7)";
                                        e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.4)";
                                        e.currentTarget.style.transform = "translateY(-8px)";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = "rgba(15, 63, 34, 0.5)";
                                        e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.2)";
                                        e.currentTarget.style.transform = "translateY(0)";
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: "36px",
                                            fontWeight: 900,
                                            color: "#22c55e",
                                            marginBottom: "16px",
                                            fontFamily: "monospace",
                                        }}
                                    >
                                        {step.num}
                                    </div>
                                    <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "#f1f5f9" }}>
                                        {step.title}
                                    </h3>
                                    <p style={{ fontSize: "14px", color: "#cbd5e1", lineHeight: "1.6" }}>{step.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* CTA FOOTER */}
                <section
                    style={{
                        padding: "120px 40px",
                        textAlign: "center",
                        maxWidth: "1000px",
                        margin: "0 auto",
                        width: "100%",
                    }}
                >
                    <h2
                        style={{
                            fontSize: "48px",
                            fontWeight: 900,
                            color: "#f1f5f9",
                            marginBottom: "24px",
                        }}
                    >
                        Ready to Transform Your Farm?
                    </h2>
                    <p style={{ fontSize: "16px", color: "#cbd5e1", marginBottom: "48px", lineHeight: "1.8" }}>
                        Join hundreds of farmers already leveraging blockchain for better financing. Start today
                        with zero fees.
                    </p>

                    <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
                        <button
                            onClick={() => handleConnect("farmer")}
                            disabled={loading}
                            style={{
                                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                                color: "#fff",
                                border: "none",
                                borderRadius: "12px",
                                padding: "16px 40px",
                                fontSize: "16px",
                                fontWeight: 700,
                                cursor: loading ? "not-allowed" : "pointer",
                                transition: "all 0.3s ease",
                            }}
                            onMouseEnter={(e) => {
                                if (!loading) e.currentTarget.style.transform = "translateY(-4px)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                        >
                            Launch App
                        </button>
                        <a
                            href="#features"
                            style={{
                                background: "rgba(34, 197, 94, 0.1)",
                                color: "#22c55e",
                                border: "2px solid rgba(34, 197, 94, 0.3)",
                                borderRadius: "12px",
                                padding: "14px 40px",
                                fontSize: "16px",
                                fontWeight: 700,
                                cursor: "pointer",
                                transition: "all 0.3s ease",
                                textDecoration: "none",
                                display: "inline-block",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "rgba(34, 197, 94, 0.15)";
                                e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.5)";
                                e.currentTarget.style.transform = "translateY(-4px)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "rgba(34, 197, 94, 0.1)";
                                e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.3)";
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                        >
                            Learn More
                        </a>
                    </div>
                </section>

                {/* FOOTER */}
                <footer
                    style={{
                        borderTop: "1px solid rgba(34, 197, 94, 0.1)",
                        padding: "40px",
                        textAlign: "center",
                        color: "#64748b",
                        fontSize: "14px",
                    }}
                >
                    <p>
                        © 2024 AgriBridge. Built on Sepolia testnet.{" "}
                        <a
                            href="https://github.com/Chijulybuilds/AgriBridge"
                            style={{ color: "#22c55e", textDecoration: "none" }}
                        >
                            View source code
                        </a>
                    </p>
                </footer>
            </main>
        </>
    );
}
