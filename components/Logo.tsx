import Link from "next/link";
import type { CSSProperties } from "react";

type Tone = "default" | "onDark";

/**
 * The AgriBridge mark: a maize cob in its husk, on a green tile. The kernel rows are cut in the
 * tile's colour. Colours come from --logo-tile, --logo-cob and --logo-leaf (styles/globals.css),
 * so the mark adapts to light, dark and green panels.
 */
export function LogoMark({ size = 30, tone = "default" }: { size?: number; tone?: Tone }) {
  const onDark = tone === "onDark" ? ({ "--logo-tile": "var(--sidebar-raised)" } as CSSProperties) : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink: 0, ...onDark }}>
      <rect width="64" height="64" rx="15" fill="var(--logo-tile)" />
      <path d="M32 9c6 0 9.5 7 9.5 17v12c0 6-4 10-9.5 10s-9.5-4-9.5-10V26c0-10 3.5-17 9.5-17Z" fill="var(--logo-cob)" />
      <path d="M21 17h22M21 23h22M21 29h22M21 35h22M21 41h22M32 11v37" stroke="var(--logo-tile)" strokeWidth="2.2" />
      <path d="M32 56c-10-4-16-12-17-26 5 8 10 14 17 17Z" fill="var(--logo-leaf)" />
      <path d="M32 56c10-4 16-12 17-26-5 8-10 14-17 17Z" fill="var(--logo-leaf)" />
    </svg>
  );
}

/** Mark and wordmark, linking home. */
export function Logo({ size = 30, href = "/", tone = "default" }: { size?: number; href?: string; tone?: Tone }) {
  const ink = tone === "onDark" ? "var(--sidebar-ink)" : "var(--text-primary)";
  return (
    <Link href={href} className="row" style={{ gap: 10, textDecoration: "none", color: ink, flexWrap: "nowrap" }}>
      <LogoMark size={size} tone={tone} />
      <span
        style={{
          fontFamily: "var(--font-display), 'Arial Narrow', sans-serif",
          fontSize: size * 0.82,
          fontWeight: 800,
          letterSpacing: "0.01em",
          lineHeight: 1,
          color: ink,
        }}
      >
        AgriBridge
      </span>
    </Link>
  );
}
