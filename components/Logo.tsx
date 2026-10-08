import Link from "next/link";

type Tone = "default" | "onDark";

/** The AgriBridge mark: a crate seen at an angle. Indigo normally; maize on dark panels. */
export function LogoMark({ size = 30, tone = "default" }: { size?: number; tone?: Tone }) {
  const fill = tone === "onDark" ? "var(--maize)" : "var(--brand)";
  const stroke = tone === "onDark" ? "var(--on-maize)" : "var(--on-brand)";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="64" height="64" rx="14" fill={fill} />
      <path d="M32 13 49 22.5v19L32 51 15 41.5v-19L32 13Z" fill="none" stroke={stroke} strokeWidth="3.6" strokeLinejoin="round" />
      <path d="M15 22.5 32 32l17-9.5M32 32v19" fill="none" stroke={stroke} strokeWidth="3.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark and wordmark, linking home. The wordmark is stencilled, like the crate it names. */
export function Logo({ size = 30, href = "/", tone = "default" }: { size?: number; href?: string; tone?: Tone }) {
  const ink = tone === "onDark" ? "oklch(0.97 0.01 272)" : "var(--text-primary)";
  const accent = tone === "onDark" ? "var(--maize)" : "var(--brand)";
  return (
    <Link href={href} className="row" style={{ gap: 10, textDecoration: "none", color: ink, flexWrap: "nowrap" }}>
      <LogoMark size={size} tone={tone} />
      <span
        style={{
          fontFamily: "var(--font-stencil), 'Arial Narrow', sans-serif",
          fontSize: size * 0.8,
          fontWeight: 800,
          letterSpacing: "0.04em",
          lineHeight: 1,
          textTransform: "uppercase",
          color: ink,
        }}
      >
        Agri<span style={{ color: accent }}>Bridge</span>
      </span>
    </Link>
  );
}
