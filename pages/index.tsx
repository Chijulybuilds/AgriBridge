import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  BuildingLibraryIcon,
  CheckBadgeIcon,
  ClockIcon,
  LockClosedIcon,
  PauseIcon,
  PlayIcon,
  ScaleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { CropSeal } from "../components/ui";
import { useCommodities, useLots, usePoolStats } from "../hooks/useProtocolData";
import { kg, percentFromBps, percentFromWad, pricePerKg, usd } from "../lib/format";

const STEPS: Array<{ role: string; tone: string; steps: Array<[string, string]> }> = [
  {
    role: "For farmers",
    tone: "var(--ok)",
    steps: [
      ["Deliver your crop", "Bring it to a partner warehouse, where it's weighed and graded."],
      ["It's on record", "Your crop becomes stock in your name, one unit per kilogram."],
      ["Borrow or sell", "Get a cash advance against it, or sell it on the market."],
      ["Repay and reclaim", "Repay with interest and your crop comes back to you."],
    ],
  },
  {
    role: "For investors",
    tone: "var(--brand)",
    steps: [
      ["Sign in", "Continue with Google, email or phone. No crypto wallet needed."],
      ["See the pool", "Live rates, what's lent out, and the crop behind every advance."],
      ["Invest", "Add dollars to the pool that funds farmers' advances."],
      ["Earn", "Interest builds up every second as farmers borrow."],
    ],
  },
  {
    role: "For buyers",
    tone: "var(--warn)",
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

  // The field video plays only for people who haven't asked for less motion, and can always be paused.
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    video.current
      ?.play()
      .then(() => setPlaying(true))
      .catch(() => {
        // Autoplay can be refused (battery saver); the play button still works.
      });
  }, []);
  function toggleVideo() {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      void v.play().then(() => setPlaying(true));
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  return (
    <>
      <Head>
        <title>AgriBridge · crop-backed finance for farmers</title>
        <meta
          name="description"
          content="Farmers store crops in trusted warehouses, then get cash advances against them or sell them. Investors fund the advances and earn interest."
        />
      </Head>

      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <nav className="landing-nav" aria-label="Main">
        <div className="landing-wrap spread" style={{ height: 68 }}>
          <Logo size={30} />
          <div className="row landing-links" style={{ gap: 28 }}>
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

      <main id="content" tabIndex={-1} style={{ outline: "none" }}>
        {/* HERO: the receipt is the thesis. */}
        <section className="landing-hero" aria-labelledby="hero-title">
          <video ref={video} className="landing-hero-video" muted loop playsInline preload="metadata" aria-hidden="true">
            <source src="/videos/3826309911-preview.mp4" type="video/mp4" />
          </video>
          <div className="landing-hero-shade" />
          <div className="landing-wrap landing-hero-grid">
            <div>
              <span className="page-eyebrow" style={{ color: "var(--maize)" }}>
                The Agri-Token Exchange
              </span>
              <h1 id="hero-title" className="landing-title">
                Crop in storage becomes money farmers can use.
              </h1>
              <p className="landing-lede">
                Farmers store crops in trusted warehouses, then get cash advances against them or sell them on the
                market. Investors fund the advances and earn interest. Sign in with Google: no crypto wallet needed.
              </p>
              <div className="row" style={{ gap: 12, marginTop: 30 }}>
                <Link className="btn btn-large btn-gold" href="/login?role=farmer">
                  I&apos;m a farmer <ArrowRightIcon aria-hidden="true" />
                </Link>
                <Link className="btn btn-large landing-ghost" href="/login?role=investor">
                  I&apos;m an investor <ArrowRightIcon aria-hidden="true" />
                </Link>
                <Link className="btn btn-large landing-ghost" href="/market">
                  Browse the market
                </Link>
              </div>
            </div>

            <Receipt />
          </div>
          <button type="button" className="landing-video-toggle" onClick={toggleVideo} aria-label={playing ? "Pause the background video" : "Play the background video"}>
            {playing ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
          </button>
        </section>

        {/* LIVE FIGURES */}
        <section className="landing-stats" aria-label="AgriBridge today">
          <div className="landing-wrap">
            <dl className="landing-stats-grid">
              {liveStats.map((s) => (
                <div key={s.label}>
                  <dt className="landing-stat-label">{s.label}</dt>
                  <dd className="num landing-stat-value">{s.value}</dd>
                </div>
              ))}
            </dl>
            <p className="muted" style={{ marginTop: 14 }}>
              Read live from the AgriBridge contracts.
            </p>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="landing-section" aria-labelledby="how-title">
          <div className="landing-wrap">
            <span className="page-eyebrow">How it works</span>
            <h2 id="how-title" className="display landing-h2">
              Three ways in, one record
            </h2>
            <div className="landing-steps">
              {STEPS.map((column) => (
                <div key={column.role} className="card" style={{ padding: 26 }}>
                  <h3 className="landing-step-role" style={{ color: column.tone }}>
                    {column.role}
                  </h3>
                  <ol style={{ listStyle: "none", display: "grid", gap: 18 }}>
                    {column.steps.map(([title, text], i) => (
                      <li key={title} className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
                        <span className="landing-step-num" style={{ color: column.tone }} aria-hidden="true">
                          {i + 1}
                        </span>
                        <span>
                          <strong style={{ display: "block", fontSize: 15.5 }}>{title}</strong>
                          <span className="text-secondary" style={{ fontSize: 14.5 }}>
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
        <section id="protection" className="landing-section landing-band" aria-labelledby="protection-title">
          <div className="landing-wrap">
            <span className="page-eyebrow">Protection</span>
            <h2 id="protection-title" className="display landing-h2">
              Built so a bad day doesn&apos;t become a bad debt
            </h2>
            <div className="landing-features">
              {PROTECTIONS.map((p) => (
                <div key={p.title} className="card" style={{ padding: 24 }}>
                  <span className="stat-icon tone-blue" style={{ marginBottom: 16 }}>
                    <p.icon aria-hidden="true" />
                  </span>
                  <h3 style={{ fontSize: 16.5, marginBottom: 6 }}>{p.title}</h3>
                  <p className="text-secondary" style={{ fontSize: 14.5 }}>
                    {p.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CROPS */}
        <section id="crops" className="landing-section" aria-labelledby="crops-title">
          <div className="landing-wrap">
            <span className="page-eyebrow">Crops</span>
            <h2 id="crops-title" className="display landing-h2">
              What the warehouses accept today
            </h2>
            {commodities.length === 0 ? (
              <p className="text-secondary">The crop list appears once the contracts are reachable.</p>
            ) : (
              <ul className="landing-crops">
                {commodities.map((c) => (
                  <li key={c.id.toString()} className="card" style={{ padding: 20 }}>
                    <div className="row" style={{ gap: 12, marginBottom: 16, flexWrap: "nowrap" }}>
                      <CropSeal name={c.name} size={38} />
                      <div>
                        <strong style={{ fontSize: 16 }}>{c.name}</strong>
                        <div className="muted">{c.priceSource === 0 ? "World price" : "Local price"}</div>
                      </div>
                    </div>
                    <div className="num display" style={{ fontSize: 34 }}>
                      {pricePerKg(c.price)}
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Borrow up to {percentFromBps(c.maxLtvBps)} · keeps {c.daysToExpiry} days
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* CTA */}
        <section className="landing-section" style={{ paddingTop: 0 }} aria-labelledby="cta-title">
          <div className="landing-wrap">
            <div className="landing-cta">
              <div>
                <h2 id="cta-title" className="display" style={{ fontSize: 48, color: "inherit", marginBottom: 10 }}>
                  Ready to start?
                </h2>
                <p style={{ color: "var(--sidebar-ink-2)", fontSize: 16 }}>
                  Sign in with Google, email or your phone number. No crypto wallet, no seed phrase.
                </p>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <Link className="btn btn-large btn-gold" href="/login?role=farmer">
                  Start as a farmer
                </Link>
                <Link className="btn btn-large landing-ghost" href="/login?role=investor">
                  Start as an investor
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap spread" style={{ flexWrap: "wrap", gap: 16 }}>
          <Logo size={24} />
          <span className="muted" style={{ fontSize: 13.5 }}>
            A testnet demo with play money, built for the STEM Festival Agri-Token Exchange brief.
          </span>
          <div className="row" style={{ gap: 18, fontSize: 14 }}>
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
        .landing-wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
        .landing-nav { position: sticky; top: 0; z-index: 40; background: var(--nav-bg); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
        .landing-links a { color: var(--text-secondary); text-decoration: none; font-weight: 700; font-size: 14.5px; }
        .landing-links a:hover { color: var(--text-primary); }

        .landing-hero { position: relative; overflow: hidden; background: oklch(0.2 0.05 272); color: oklch(0.97 0.01 272); }
        .landing-hero-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .landing-hero-shade { position: absolute; inset: 0;
          background: linear-gradient(100deg, oklch(0.17 0.05 272 / 0.95) 0%, oklch(0.17 0.05 272 / 0.84) 48%, oklch(0.17 0.05 272 / 0.5) 100%); }
        .landing-hero-grid { position: relative; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 64px; align-items: center; padding-top: 104px; padding-bottom: 112px; }
        .landing-title { font-size: clamp(52px, 6.2vw, 88px); font-weight: 800; line-height: 0.9; letter-spacing: 0; color: inherit; margin: 10px 0 24px; }
        .landing-lede { font-size: 18px; line-height: 1.6; color: oklch(0.88 0.02 272); max-width: 560px; }
        .landing-ghost { background: oklch(1 0 0 / 0.08); color: oklch(0.97 0.01 272); border-color: oklch(1 0 0 / 0.32); box-shadow: none; }
        .landing-ghost:hover:not(:disabled) { background: oklch(1 0 0 / 0.16); }
        .landing-hero .btn:focus-visible, .landing-video-toggle:focus-visible, .landing-cta .btn:focus-visible { outline-color: var(--maize); }
        .landing-video-toggle { position: absolute; right: 20px; bottom: 20px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%;
          background: oklch(0.17 0.05 272 / 0.6); color: oklch(0.97 0.01 272); border: 1px solid oklch(1 0 0 / 0.3); cursor: pointer; }
        .landing-video-toggle svg { width: 18px; height: 18px; }

        /* The warehouse receipt: the one memorable object on the page. Paper in both themes. */
        .receipt { --paper: oklch(0.975 0.012 85); --paper-2: oklch(0.95 0.02 85); --paper-ink: oklch(0.25 0.04 272); --paper-ink-2: oklch(0.45 0.03 272);
          --paper-line: oklch(0.82 0.025 85); --stamp-ink: oklch(0.44 0.17 288);
          position: relative; margin: 0; padding: 24px 26px 0; border-radius: 6px 6px 12px 12px; background: var(--paper); color: var(--paper-ink);
          box-shadow: 0 30px 60px -24px oklch(0 0 0 / 0.65), 0 2px 8px oklch(0 0 0 / 0.25); rotate: 1.5deg; font-variant-numeric: tabular-nums; }
        .receipt-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding-bottom: 14px; border-bottom: 2px solid var(--paper-ink); }
        .receipt-title, .receipt-no { font-family: var(--font-stencil), "Arial Narrow", sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }
        .receipt-title { font-size: 15px; }
        .receipt-no { font-size: 20px; }
        .receipt-crop { display: flex; align-items: center; gap: 12px; padding: 16px 0 6px; }
        .receipt-crop strong { display: block; font-size: 18px; }
        .receipt-crop-text span { font-size: 13.5px; color: var(--paper-ink-2); }
        .receipt-rows { margin: 0; }
        .receipt-rows div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px dashed var(--paper-line); font-size: 14.5px; }
        .receipt-rows dt { color: var(--paper-ink-2); }
        .receipt-rows dd { margin: 0; font-weight: 700; }
        /* The stamp sits in the empty middle of the rows, between the labels and the values, at every width. */
        .receipt-rows-wrap { position: relative; }
        .stamp { position: absolute; left: 50%; top: 50%; translate: -50% -50%; display: grid; justify-items: center; gap: 1px; padding: 8px 14px 9px;
          border: 4px double var(--stamp-ink); border-radius: 10px; color: var(--stamp-ink); text-transform: uppercase; line-height: 1.05;
          font-family: var(--font-stencil), "Arial Narrow", sans-serif; letter-spacing: 0.12em; rotate: -11deg; opacity: 0.9; mix-blend-mode: multiply;
          -webkit-mask-image: var(--ink-wear); mask-image: var(--ink-wear); -webkit-mask-size: 140px 70px; mask-size: 140px 70px; }
        .stamp-big { font-size: 26px; font-weight: 800; }
        .stamp-small { font-size: 11.5px; font-weight: 700; }
        .receipt-stub { position: relative; margin: 20px -26px 0; padding: 18px 26px 22px; background: var(--paper-2); border-top: 2px dashed var(--paper-line);
          border-radius: 0 0 12px 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .receipt-stub::before, .receipt-stub::after { content: ""; position: absolute; top: -9px; width: 16px; height: 16px; border-radius: 50%; background: oklch(0.2 0.05 272); }
        .receipt-stub::before { left: -8px; }
        .receipt-stub::after { right: -8px; }
        .receipt-stub span { display: block; font-size: 13px; color: var(--paper-ink-2); }
        .receipt-stub strong { display: block; margin: 4px 0 2px; font-family: var(--font-display), "Arial Narrow", sans-serif; font-size: 34px; font-weight: 800; line-height: 1; }
        .receipt-example { position: absolute; top: -12px; left: 22px; padding: 3px 10px; border-radius: 999px; background: var(--maize); color: var(--on-maize);
          font-size: 11.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
        @media (prefers-reduced-motion: no-preference) {
          .stamp { animation: stamp-in 460ms cubic-bezier(0.2, 0.9, 0.3, 1) 650ms both; }
        }
        @keyframes stamp-in {
          from { opacity: 0; scale: 1.7; rotate: -20deg; }
          to { opacity: 0.9; scale: 1; rotate: -11deg; }
        }

        .landing-stats { background: var(--bg-card); border-bottom: 1px solid var(--border); padding: 34px 0 26px; }
        .landing-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin: 0; }
        .landing-stats-grid div { display: flex; flex-direction: column-reverse; gap: 6px; }
        .landing-stat-label { font-size: 14px; color: var(--text-secondary); }
        .landing-stat-value { margin: 0; font-family: var(--font-display), "Arial Narrow", sans-serif; font-size: 46px; font-weight: 800; line-height: 1; color: var(--brand); }
        .landing-section { padding: 88px 0; }
        .landing-band { background-color: var(--bg-secondary); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .landing-h2 { font-size: clamp(36px, 4.6vw, 58px); font-weight: 800; line-height: 0.95; margin: 4px 0 36px; max-width: 760px; }
        .landing-steps, .landing-features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .landing-crops { list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .landing-step-role { font-size: 13px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 20px; }
        .landing-step-num { width: 30px; height: 30px; border-radius: 50%; border: 2px solid; display: grid; place-items: center; flex-shrink: 0;
          font-family: var(--font-display), "Arial Narrow", sans-serif; font-size: 17px; font-weight: 800; line-height: 1; }
        .landing-cta { display: flex; justify-content: space-between; align-items: center; gap: 28px; flex-wrap: wrap; padding: 48px; border-radius: 20px;
          background: var(--sidebar-bg); color: var(--sidebar-ink); }
        .landing-footer { padding: 28px 0 40px; border-top: 1px solid var(--border); }
        :root { --ink-wear: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='70'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 1 1 1 1 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='140' height='70' filter='url(%23n)'/%3E%3C/svg%3E"); }
        @media (max-width: 960px) {
          .landing-hero-grid { grid-template-columns: 1fr; padding-top: 64px; padding-bottom: 88px; gap: 48px; }
          .landing-steps, .landing-features { grid-template-columns: 1fr; }
          .landing-stats-grid, .landing-crops { grid-template-columns: repeat(2, 1fr); }
          .landing-links { display: none !important; }
          .landing-section { padding: 64px 0; }
          .landing-cta { padding: 32px 24px; }
          .receipt { rotate: 0deg; }
        }
      `}</style>
    </>
  );
}

/** An example warehouse receipt: what a farmer gets when the warehouse weighs and grades their crop. */
function Receipt() {
  return (
    <figure className="receipt" aria-labelledby="receipt-caption">
      <figcaption id="receipt-caption" className="receipt-example">
        Example
      </figcaption>
      <div className="receipt-top">
        <span className="receipt-title">Warehouse receipt</span>
        <span className="receipt-no">No. 0231</span>
      </div>
      <div className="receipt-crop">
        <CropSeal name="Cocoa" size={40} />
        <div className="receipt-crop-text">
          <strong>Cocoa beans</strong>
          <span>Ibadan warehouse · weighed and graded today</span>
        </div>
      </div>
      <div className="receipt-rows-wrap">
        <dl className="receipt-rows">
          <div>
            <dt>Net weight</dt>
            <dd>1,000 kg</dd>
          </div>
          <div>
            <dt>Grade</dt>
            <dd>A</dd>
          </div>
          <div>
            <dt>Worth today</dt>
            <dd>$4,972</dd>
          </div>
        </dl>
        <div className="stamp" aria-hidden="true">
          <span className="stamp-big">Verified</span>
          <span className="stamp-small">Grade A · Ibadan</span>
        </div>
      </div>
      <div className="receipt-stub">
        <div>
          <span>Advance available</span>
          <strong>$2,279</strong>
          <span>repay within 60 days</span>
        </div>
        <div>
          <span>Or sell it on the market</span>
          <strong>$4.97</strong>
          <span>per kg, from today</span>
        </div>
      </div>
    </figure>
  );
}
