/**
 * Simple flat drawings for the tutorial: people, places and things, never diagrams. They use the
 * app's colours, so they follow the light and dark themes, and they are decorative: every step's
 * words carry its meaning on their own.
 */
export type IllustrationName =
  | "welcome"
  | "info"
  | "wallet"
  | "roles"
  | "money"
  | "deliver"
  | "warehouse"
  | "advance"
  | "record"
  | "invest"
  | "market"
  | "clock"
  | "shield";

const G = "var(--brand)";
const GS = "var(--brand-soft)";
const M = "var(--maize)";
const INK = "var(--text-primary)";
const CARD = "var(--bg-card)";

function Person({ x, y, shirt = G, scale = 1 }: { x: number; y: number; shirt?: string; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="0" cy="-34" r="11" fill="#c98b5a" />
      <path d="M-11 -40 Q0 -54 11 -40 L13 -36 L-13 -36 Z" fill={M} />
      <rect x="-14" y="-22" width="28" height="34" rx="9" fill={shirt} />
      <rect x="-12" y="12" width="9" height="22" rx="4" fill={INK} />
      <rect x="3" y="12" width="9" height="22" rx="4" fill={INK} />
    </g>
  );
}

function Sack({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-14 0 Q-18 -26 -6 -32 L6 -32 Q18 -26 14 0 Z" fill="#d9b77e" />
      <rect x="-7" y="-36" width="14" height="6" rx="2" fill="#a9874f" />
    </g>
  );
}

function House({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-46 0 L-46 -40 L0 -66 L46 -40 L46 0 Z" fill={GS} stroke={G} strokeWidth="3" />
      <rect x="-14" y="-30" width="28" height="30" fill={G} />
      <path d="M-46 -40 L0 -66 L46 -40" fill="none" stroke={G} strokeWidth="5" strokeLinejoin="round" />
    </g>
  );
}

function Coin({ x, y, r = 12 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={M} stroke="var(--maize-strong)" strokeWidth="2" />
      <text x={x} y={y + r * 0.38} textAnchor="middle" fontSize={r * 1.1} fontWeight="700" fill="var(--on-maize)">
        $
      </text>
    </g>
  );
}

function Phone({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-24" y="-46" width="48" height="84" rx="9" fill={INK} />
      <rect x="-19" y="-38" width="38" height="66" rx="4" fill={CARD} />
      <circle cx="0" cy="-12" r="9" fill="#f6851b" />
      <rect x="-12" y="6" width="24" height="7" rx="3" fill={G} />
    </g>
  );
}

const SCENES: Record<IllustrationName, React.ReactNode> = {
  welcome: (
    <>
      <House x={190} y={96} />
      <Person x={70} y={70} />
      <Sack x={104} y={98} />
      <Coin x={128} y={40} />
    </>
  ),
  info: (
    <>
      <circle cx="120" cy="56" r="34" fill={GS} stroke={G} strokeWidth="4" />
      <text x="120" y="72" textAnchor="middle" fontSize="44" fontWeight="800" fontFamily="Georgia, serif" fill={G}>
        i
      </text>
      <path d="M150 34 L190 22 L190 66 L162 66 Z" fill={CARD} stroke="var(--border-light)" strokeWidth="2" />
      <rect x="166" y="34" width="18" height="4" rx="2" fill="var(--text-muted)" />
      <rect x="166" y="44" width="14" height="4" rx="2" fill="var(--text-muted)" />
    </>
  ),
  wallet: (
    <>
      <Phone x={120} y={58} />
      <path d="M160 56 l10 10 l18 -22" fill="none" stroke="var(--ok)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  roles: (
    <>
      <Person x={60} y={72} />
      <Sack x={88} y={98} />
      <Person x={130} y={72} shirt="var(--info)" />
      <Coin x={156} y={70} r={10} />
      <Person x={196} y={72} shirt={M} />
    </>
  ),
  money: (
    <>
      <Coin x={90} y={66} r={18} />
      <Coin x={124} y={50} r={18} />
      <Coin x={158} y={66} r={18} />
    </>
  ),
  deliver: (
    <>
      <rect x="28" y="54" width="80" height="34" rx="6" fill={G} />
      <rect x="108" y="64" width="30" height="24" rx="5" fill="var(--brand-strong)" />
      <circle cx="52" cy="92" r="9" fill={INK} />
      <circle cx="124" cy="92" r="9" fill={INK} />
      <Sack x={56} y={52} />
      <Sack x={82} y={52} />
      <House x={198} y={96} />
    </>
  ),
  warehouse: (
    <>
      <House x={120} y={96} />
      <Sack x={62} y={98} />
      <Sack x={178} y={98} />
      <rect x="150" y="18" width="40" height="24" rx="5" fill={M} />
      <text x="170" y="36" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--on-maize)">
        A
      </text>
    </>
  ),
  advance: (
    <>
      <Sack x={70} y={92} />
      <House x={70} y={96} />
      <path d="M118 58 H160" stroke={G} strokeWidth="5" strokeLinecap="round" />
      <path d="M152 48 L164 58 L152 68" fill="none" stroke={G} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <Coin x={190} y={58} r={20} />
    </>
  ),
  record: (
    <>
      <rect x="78" y="14" width="84" height="88" rx="8" fill={CARD} stroke="var(--border-light)" strokeWidth="2" />
      {[34, 56, 78].map((y) => (
        <g key={y}>
          <path d={`M92 ${y} l6 6 l12 -12`} fill="none" stroke="var(--ok)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="118" y={y - 4} width="32" height="7" rx="3" fill="var(--text-muted)" />
        </g>
      ))}
    </>
  ),
  invest: (
    <>
      <path d="M80 50 H160 L150 100 H90 Z" fill={GS} stroke={G} strokeWidth="4" strokeLinejoin="round" />
      <Coin x={104} y={38} r={13} />
      <Coin x={130} y={26} r={13} />
      <Coin x={150} y={44} r={11} />
      <path d="M186 90 V40 M176 50 L186 40 L196 50" fill="none" stroke="var(--ok)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  market: (
    <>
      <path d="M50 40 H190 L178 22 H62 Z" fill={M} />
      <rect x="58" y="40" width="124" height="54" fill={CARD} stroke="var(--border-light)" strokeWidth="2" />
      <Sack x={88} y={88} />
      <Sack x={120} y={88} />
      <Sack x={152} y={88} />
    </>
  ),
  clock: (
    <>
      <circle cx="120" cy="58" r="40" fill={CARD} stroke={G} strokeWidth="5" />
      <path d="M120 58 V34 M120 58 L138 68" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      {["A", "B", "C"].map((g, i) => (
        <text key={g} x={180} y={34 + i * 26} fontSize="18" fontWeight="800" fill={i === 0 ? G : "var(--text-muted)"}>
          {g}
        </text>
      ))}
    </>
  ),
  shield: (
    <>
      <path d="M120 16 L160 30 V62 Q160 92 120 106 Q80 92 80 62 V30 Z" fill={GS} stroke={G} strokeWidth="5" strokeLinejoin="round" />
      <path d="M102 62 l12 12 l24 -26" fill="none" stroke={G} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function Illustration({ name }: { name: IllustrationName }) {
  return (
    <svg className="tour-art" viewBox="0 0 240 116" role="presentation" aria-hidden="true" focusable="false">
      {SCENES[name]}
    </svg>
  );
}
