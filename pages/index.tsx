import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowRightIcon,
  BoltIcon,
  BuildingLibraryIcon,
  CheckBadgeIcon,
  ClockIcon,
  LockClosedIcon,
  ScaleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { CropSeal } from "../components/ui";
import { useCommodities, useLots, usePoolStats } from "../hooks/useProtocolData";
import { kg, percentFromBps, percentFromWad, pricePerKg, usd } from "../lib/format";
import type { AppRole } from "../lib/session";

const STEPS: Array<{ role: string; tone: string; steps: Array<[string, string]> }> = [
  {
    role: "For farmers",
    tone: "var(--accent-green)",
    steps: [
      ["Deliver your crop", "Bring it to a partner warehouse, where it's weighed and graded."],
      ["It's on record", "Your crop becomes stock in your name, one unit per kilogram."],
      ["Borrow or sell", "Get a cash advance against it, or sell it on the market."],
      ["Repay and reclaim", "Repay with interest and your crop comes back to you."],
    ],
  },
  {
    role: "For investors",
    tone: "var(--accent-gold)",
    steps: [
      ["Sign in", "Continue with Google, email or phone. No crypto wallet needed."],
      ["See the pool", "Live rates, what's lent out, and the crop behind every advance."],
      ["Invest", "Add dollars to the pool that funds farmers' advances."],
      ["Earn", "Interest builds up every second as farmers borrow."],
    ],
  },
  {
    role: "For buyers",
    tone: "var(--accent-blue)",
    steps: [
      ["Browse the market", "Graded stock in the warehouses, by crop, grade and place."],
      ["Buy any amount", "Take part or all of a listing; bulk deals for large orders."],
      ["Collect or resell", "Pick it up or have it delivered, or sell it on."],
      ["Feed-grade stock", "Expired crop at a discount, for animal feed."],
    ],
  },
];

const PROTECTIONS = [
  { icon: CheckBadgeIcon, title: "One verifier, many keys", text: "Only the warehouse team's multisig Safe can grade and approve crop. The contracts refuse anyone else." },
  { icon: ClockIcon, title: "Crop ages, value follows", text: "Each crop loses value a little every day, from Grade A to B to C, so loans are sized to what it will be worth." },
  { icon: ScaleIcon, title: "Settled before it's underwater", text: "An advance is settled at 80% of the crop's value, or when it's a week late. The farmer keeps what's left." },
  { icon: ShieldCheckIcon, title: "A cushion for losses", text: "A fifth of all interest builds a reserve that absorbs bad debt before investors do." },
  { icon: BuildingLibraryIcon, title: "A regulator can step in", text: "Any lot or warehouse can be frozen during an investigation. Frozen stock can't move." },
  { icon: LockClosedIcon, title: "Prices with safeguards", text: "Stale prices are refused, big jumps must be confirmed, and an emergency brake pauses the market." },
];

export default function Home() {
  const router = useRouter();
  const { stats } = usePoolStats();
  const { lots, isLoading: lotsLoading } = useLots();
  const { commodities } = useCommodities();
  const storedKg = lots.reduce((sum, l) => (l.status === "Verified" ? sum + (l.supplyKg ?? 0n) : sum), 0n);

  // Live figures from the contracts; nothing on this page is made up.
  const liveStats = [
    { label: "In the lending pool", value: stats ? usd(stats.totalAssets, 0) : "—" },
    { label: "Crop in storage", value: lotsLoading ? "—" : kg(storedKg) },
    { label: "Crops accepted", value: commodities.length ? String(commodities.filter((c) => c.active).length) : "—" },
    { label: "Investors earn now", value: stats ? `${percentFromWad(stats.supplyRate)} a year` : "—" },
  ];

  // Dashboards need a signed-in account, so the role buttons go through /login.
  const start = (role: AppRole) => router.push(`/login?role=${role}`);

  return (
    <>
      <Head>
        <title>AgriBridge · crop-backed finance for farmers</title>
        <meta
          name="description"
          content="Farmers store crops in trusted warehouses, then get cash advances against them or sell them. Investors fund the advances and earn interest."
        />
      </Head>

      <nav className="landing-nav">
        <div className="landing-wrap spread" style={{ height: 68 }}>
          <Logo size={32} />
          <div className="row landing-links" style={{ gap: 26 }}>
            <a href="#how">How it works</a>
            <a href="#protection">Protection</a>
            <a href="#crops">Crops</a>
            <Link href="/market">Market</Link>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <ThemeToggle />
            <Link className="btn btn-secondary btn-small" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="landing-hero">
        <video className="landing-hero-video" autoPlay muted loop playsInline preload="metadata" aria-hidden="true">
          <source src="/videos/3826309911-preview.mp4" type="video/mp4" />
        </video>
        <div className="landing-hero-shade" />
        <div className="landing-wrap landing-hero-grid">
          <div>
            <span className="page-eyebrow" style={{ color: "#e0a93b" }}>
              The Agri-Token Exchange
            </span>
            <h1 className="display landing-title">
              Crop in storage becomes money farmers can use.
            </h1>
            <p className="landing-lede">
              Farmers store crops in trusted warehouses, then get cash advances against them or sell them on the
              market. Investors fund the advances and earn interest. Sign in with Google: no crypto wallet needed.
            </p>
            <div className="row" style={{ gap: 12, marginTop: 28 }}>
              <button className="btn btn-large btn-gold" onClick={() => void start("farmer")}>
                I&apos;m a Farmer <ArrowRightIcon />
              </button>
              <button className="btn btn-large landing-ghost" onClick={() => void start("investor")}>
                I&apos;m an Investor <ArrowRightIcon />
              </button>
              <Link className="btn btn-large landing-ghost" href="/market">
                Browse the market
              </Link>
            </div>
          </div>

          {/* What a lot looks like in the app (an example, not live data). */}
          <div className="landing-lot" aria-label="Example of a lot in AgriBridge">
            <div className="spread" style={{ marginBottom: 16 }}>
              <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
                <CropSeal name="Cocoa" size={42} />
                <div>
                  <div className="display" style={{ fontSize: 19, color: "#f4efe2" }}>
                    Cocoa · 1,000 kg
                  </div>
                  <div style={{ fontSize: 12.5, color: "rgba(244,239,226,0.7)" }}>Ibadan warehouse · graded today</div>
                </div>
              </div>
              <span className="badge badge-plain" style={{ background: "rgba(224,169,59,0.18)", color: "#f0c46a" }}>
                Grade A
              </span>
            </div>
            <div className="landing-lot-row">
              <span>Worth today</span>
              <strong>$4,972</strong>
            </div>
            <div className="landing-lot-row">
              <span>Advance available, repay in 60 days</span>
              <strong>up to $2,279</strong>
            </div>
            <div className="landing-lot-row">
              <span>Or sell it on the market</span>
              <strong>from $4.97/kg</strong>
            </div>
            <div className="landing-bars" aria-hidden="true">
              {[100, 96, 92, 88, 84, 80, 75, 69, 63, 57, 51, 46, 40].map((h, i) => (
                <span key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="spread" style={{ fontSize: 11.5, color: "rgba(244,239,226,0.6)", marginTop: 6 }}>
              <span>Value today</span>
              <span>As it ages, until it expires</span>
            </div>
            <span className="landing-example">Example</span>
          </div>
        </div>
      </header>

      {/* LIVE FIGURES */}
      <section className="landing-stats">
        <div className="landing-wrap landing-stats-grid">
          {liveStats.map((s) => (
            <div key={s.label}>
              <div className="num landing-stat-value">{s.value}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
        <p className="landing-wrap muted" style={{ marginTop: 10, fontSize: 12 }}>
          Read live from the contracts.
        </p>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="landing-section">
        <div className="landing-wrap">
          <span className="page-eyebrow">How it works</span>
          <h2 className="display landing-h2">Three ways in, one record</h2>
          <div className="landing-steps">
            {STEPS.map((column) => (
              <div key={column.role} className="card" style={{ padding: 26 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: column.tone, marginBottom: 18 }}>
                  {column.role}
                </div>
                <ol style={{ listStyle: "none", display: "grid", gap: 18 }}>
                  {column.steps.map(([title, text], i) => (
                    <li key={title} className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
                      <span className="landing-step-num" style={{ color: column.tone, borderColor: column.tone }}>
                        {i + 1}
                      </span>
                      <span>
                        <strong style={{ display: "block", fontSize: 14.5 }}>{title}</strong>
                        <span className="text-secondary" style={{ fontSize: 13.5 }}>
                          {text}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROTECTION */}
      <section id="protection" className="landing-section landing-band field-rows">
        <div className="landing-wrap">
          <span className="page-eyebrow">Protection</span>
          <h2 className="display landing-h2">Built so a bad day doesn&apos;t become a bad debt</h2>
          <div className="landing-features">
            {PROTECTIONS.map((p) => (
              <div key={p.title} className="card" style={{ padding: 24 }}>
                <span className="stat-icon tone-green" style={{ marginBottom: 14 }}>
                  <p.icon />
                </span>
                <h3 style={{ fontSize: 17, marginBottom: 6 }}>{p.title}</h3>
                <p className="text-secondary" style={{ fontSize: 13.5 }}>
                  {p.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CROPS */}
      <section id="crops" className="landing-section">
        <div className="landing-wrap">
          <span className="page-eyebrow">Crops</span>
          <h2 className="display landing-h2">What the warehouses accept today</h2>
          {commodities.length === 0 ? (
            <p className="text-secondary">The crop list appears once the contracts are reachable.</p>
          ) : (
            <div className="landing-crops">
              {commodities.map((c) => (
                <div key={c.id.toString()} className="card" style={{ padding: 20 }}>
                  <div className="row" style={{ gap: 12, marginBottom: 14, flexWrap: "nowrap" }}>
                    <CropSeal name={c.name} size={38} />
                    <div>
                      <strong style={{ fontSize: 15 }}>{c.name}</strong>
                      <div className="muted">{c.priceSource === 0 ? "World price" : "Local price"}</div>
                    </div>
                  </div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 800 }}>
                    {pricePerKg(c.price)}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Borrow up to {percentFromBps(c.maxLtvBps)} · keeps {c.daysToExpiry} days
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="landing-section">
        <div className="landing-wrap">
          <div className="landing-cta">
            <div>
              <h2 className="display" style={{ fontSize: 34, color: "#f4efe2", marginBottom: 8 }}>
                Ready to start?
              </h2>
              <p style={{ color: "rgba(244,239,226,0.8)", fontSize: 15 }}>
                Sign in with Google, email or your phone number. No crypto wallet, no seed phrase.
              </p>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <button className="btn btn-large btn-gold" onClick={() => void start("farmer")}>
                Start as a farmer
              </button>
              <button className="btn btn-large landing-ghost" onClick={() => void start("investor")}>
                Start as an investor
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-wrap spread" style={{ flexWrap: "wrap", gap: 16 }}>
          <Logo size={26} />
          <span className="muted" style={{ fontSize: 12.5 }}>
            <BoltIcon style={{ width: 13, height: 13, verticalAlign: "-2px" }} /> A testnet demo with play money, built for the
            STEM Festival Agri-Token Exchange brief.
          </span>
          <div className="row" style={{ gap: 18, fontSize: 13 }}>
            <Link className="link" href="/market">
              Market
            </Link>
            <Link className="link" href="/activity">
              Activity
            </Link>
          </div>
        </div>
      </footer>

      <style>{`
        .landing-wrap { max-width: 1160px; margin: 0 auto; padding: 0 24px; }
        .landing-nav { position: sticky; top: 0; z-index: 40; background: var(--nav-bg); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
        .landing-links a { color: var(--text-secondary); text-decoration: none; font-weight: 600; font-size: 13.5px; }
        .landing-links a:hover { color: var(--text-primary); }
        .landing-hero { position: relative; overflow: hidden; background: #0f2a1a; }
        .landing-hero-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .landing-hero-shade { position: absolute; inset: 0;
          background: linear-gradient(100deg, rgba(10,28,17,0.94) 0%, rgba(10,28,17,0.82) 45%, rgba(10,28,17,0.55) 100%),
            repeating-linear-gradient(-24deg, rgba(255,255,255,0.035) 0, rgba(255,255,255,0.035) 2px, transparent 2px, transparent 22px); }
        .landing-hero-grid { position: relative; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 56px; align-items: center; padding-top: 96px; padding-bottom: 104px; }
        .landing-title { font-size: clamp(38px, 5.2vw, 62px); line-height: 1.04; color: #f7f2e6; margin: 8px 0 20px; letter-spacing: -0.025em; }
        .landing-lede { font-size: 17px; line-height: 1.65; color: rgba(244,239,226,0.82); max-width: 560px; }
        .landing-ghost { background: rgba(255,255,255,0.08); color: #f4efe2; border-color: rgba(244,239,226,0.28); box-shadow: none; }
        .landing-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
        .landing-lot { position: relative; padding: 24px; border-radius: 20px; background: rgba(16,40,25,0.72); border: 1px solid rgba(244,239,226,0.16);
          backdrop-filter: blur(14px); box-shadow: 0 30px 60px -24px rgba(0,0,0,0.6); }
        .landing-lot-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px dashed rgba(244,239,226,0.14);
          font-size: 13.5px; color: rgba(244,239,226,0.75); }
        .landing-lot-row strong { color: #f7f2e6; font-variant-numeric: tabular-nums; }
        .landing-bars { display: flex; align-items: flex-end; gap: 4px; height: 70px; margin-top: 16px; }
        .landing-bars span { flex: 1; border-radius: 4px 4px 1px 1px; background: linear-gradient(180deg, #6fcb90, #2f8a55); opacity: 0.9; }
        .landing-bars span:first-child { background: linear-gradient(180deg, #f0c46a, #e0a93b); }
        .landing-example { position: absolute; top: -11px; right: 18px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
          background: #e0a93b; color: #2a1c02; padding: 3px 10px; border-radius: 999px; }
        .landing-stats { background: var(--bg-card); border-bottom: 1px solid var(--border); padding: 30px 0 22px; }
        .landing-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
        .landing-stat-value { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; color: var(--accent-green); }
        .landing-section { padding: 84px 0; }
        .landing-band { background-color: var(--bg-secondary); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .landing-h2 { font-size: clamp(28px, 3.4vw, 40px); line-height: 1.1; margin: 6px 0 34px; max-width: 720px; }
        .landing-steps, .landing-features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .landing-crops { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; }
        .landing-step-num { width: 28px; height: 28px; border-radius: 50%; border: 1.5px solid; display: grid; place-items: center;
          font-size: 12.5px; font-weight: 800; flex-shrink: 0; }
        .landing-cta { display: flex; justify-content: space-between; align-items: center; gap: 28px; flex-wrap: wrap; padding: 44px; border-radius: 24px;
          background-color: #143d25; background-image: repeating-linear-gradient(-24deg, rgba(255,255,255,0.045) 0, rgba(255,255,255,0.045) 2px, transparent 2px, transparent 22px),
          radial-gradient(120% 120% at 100% 0%, rgba(224,169,59,0.25), transparent 55%); }
        .landing-footer { padding: 28px 0 40px; border-top: 1px solid var(--border); }
        @media (max-width: 960px) {
          .landing-hero-grid { grid-template-columns: 1fr; padding-top: 64px; padding-bottom: 72px; gap: 40px; }
          .landing-steps, .landing-features { grid-template-columns: 1fr; }
          .landing-stats-grid { grid-template-columns: repeat(2, 1fr); }
          .landing-links { display: none !important; }
          .landing-section { padding: 60px 0; }
          .landing-cta { padding: 30px 24px; }
        }
      `}</style>
    </>
  );
}
