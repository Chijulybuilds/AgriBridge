import { useId, type ReactNode } from "react";

/**
 * Sketch-style drawings for the tutorial and the help: bold ink lines with a slight hand-drawn
 * wobble, flat maize and field-green fills, and halftone dots for shade, on a small panel of
 * receipt paper (so the ink reads the same in light and dark mode).
 *
 * The guide is the cob from the AgriBridge logo: a maize cob in its husk, in sunglasses, who shows
 * each step. The drawings are decorative; every step's words carry its meaning on their own.
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

const INK = "#1e2420";
const MAIZE = "#f3c234";
const MAIZE_DEEP = "#d9a21c";
const LEAF = "#3f9b5b";
const LEAF_DEEP = "#2b7343";
const PAPER = "#fbf6ea";
const CREAM = "#fffdf7";

/** Ink line settings shared by every outline. */
const ink = { stroke: INK, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" } as const;

type Ids = { rough: string; dots: string; clip: (name: string) => string };

/* ───────────────────────────── The guide ───────────────────────────── */

type Arms = "wave" | "hold" | "point" | "cheer" | "rest";

/**
 * The cob: a maize cob body with kernels, husk leaves behind, sunglasses, a smile, and stick arms
 * and legs. `x`/`y` place its feet; `scale` sizes it; `arms` sets the pose.
 */
function Cob({ x, y, scale = 1, arms = "rest", ids, hat = false }: { x: number; y: number; scale?: number; arms?: Arms; ids: Ids; hat?: boolean }) {
  const body = "M0 -96 C 22 -96 30 -70 30 -44 C 30 -18 22 0 0 0 C -22 0 -30 -18 -30 -44 C -30 -70 -22 -96 0 -96 Z";
  const clip = ids.clip(`cob-${x}-${y}`);
  const rows = [-84, -74, -64, -54, -44, -34, -24, -14];
  const armPaths: Record<Arms, [string, string]> = {
    rest: ["M-28 -40 Q -42 -30 -44 -16", "M28 -40 Q 42 -30 44 -16"],
    wave: ["M-28 -40 Q -42 -30 -44 -16", "M28 -44 Q 46 -60 52 -82"],
    hold: ["M-28 -42 Q -44 -40 -40 -26", "M28 -42 Q 46 -40 42 -26"],
    point: ["M-28 -40 Q -42 -30 -44 -16", "M28 -46 Q 50 -50 62 -52"],
    cheer: ["M-28 -46 Q -46 -62 -52 -84", "M28 -46 Q 46 -62 52 -84"],
  };
  const hands: Record<Arms, Array<[number, number]>> = {
    rest: [[-44, -14], [44, -14]],
    wave: [[-44, -14], [53, -85]],
    hold: [[-40, -24], [42, -24]],
    point: [[-44, -14], [64, -52]],
    cheer: [[-53, -87], [53, -87]],
  };
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <defs>
        <clipPath id={clip}>
          <path d={body} />
        </clipPath>
      </defs>
      <g filter={`url(#${ids.rough})`}>
        {/* Legs and feet */}
        <path d="M-12 -2 L -14 16 M12 -2 L 14 16" {...ink} fill="none" />
        <ellipse cx="-18" cy="18" rx="9" ry="4.5" fill={INK} />
        <ellipse cx="18" cy="18" rx="9" ry="4.5" fill={INK} />
        {/* Husk leaves behind the cob */}
        <path d="M-6 -20 C -40 -30 -46 -70 -34 -104 C -26 -76 -16 -52 -6 -40 Z" fill={LEAF} {...ink} />
        <path d="M6 -20 C 40 -30 46 -70 34 -104 C 26 -76 16 -52 6 -40 Z" fill={LEAF_DEEP} {...ink} />
        {/* The cob */}
        <path d={body} fill={MAIZE} {...ink} />
        <g clipPath={`url(#${clip})`}>
          {rows.map((ry, r) =>
            [-24, -12, 0, 12, 24].map((kx) => (
              <ellipse
                key={`${r}-${kx}`}
                cx={kx + (r % 2 ? 6 : 0)}
                cy={ry}
                rx="5.2"
                ry="4.2"
                fill={MAIZE}
                stroke={MAIZE_DEEP}
                strokeWidth="1.6"
              />
            )),
          )}
          {/* Shade down the right side, in halftone */}
          <rect x="6" y="-100" width="30" height="104" fill={`url(#${ids.dots})`} opacity="0.55" />
        </g>
        <path d={body} fill="none" {...ink} />
        {/* Sunglasses and smile */}
        <path d="M-22 -66 L -3 -66 L -5 -56 Q -13 -51 -20 -56 Z" fill={INK} {...ink} strokeWidth={2} />
        <path d="M3 -66 L 22 -66 L 20 -56 Q 13 -51 5 -56 Z" fill={INK} {...ink} strokeWidth={2} />
        <path d="M-3 -64 L 3 -64" {...ink} strokeWidth={2} />
        <path d="M-18 -63 L -13 -63" stroke={CREAM} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M7 -63 L 12 -63" stroke={CREAM} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M-10 -44 Q 0 -35 10 -44" {...ink} fill="none" />
        {/* Arms and hands */}
        <path d={armPaths[arms][0]} {...ink} fill="none" />
        <path d={armPaths[arms][1]} {...ink} fill="none" />
        {hands[arms].map(([hx, hy], i) => (
          <circle key={i} cx={hx} cy={hy} r="4.6" fill={CREAM} {...ink} strokeWidth={2.4} />
        ))}
        {hat && (
          <g>
            <ellipse cx="0" cy="-98" rx="36" ry="8" fill="#e6c789" {...ink} />
            <path d="M-18 -100 Q -16 -122 0 -122 Q 16 -122 18 -100 Z" fill="#e6c789" {...ink} />
            <path d="M-17 -104 Q 0 -100 17 -104" stroke={LEAF_DEEP} strokeWidth="4" fill="none" />
          </g>
        )}
      </g>
    </g>
  );
}

/* ───────────────────────────── Props ───────────────────────────── */

function Sack({ x, y, s = 1, label }: { x: number; y: number; s?: number; label?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-22 0 C -28 -26 -20 -44 -8 -48 L 8 -48 C 20 -44 28 -26 22 0 Z" fill="#e7cf98" {...ink} />
      <path d="M-10 -50 Q 0 -58 10 -50" {...ink} fill="none" />
      <path d="M-11 -46 L 11 -46" {...ink} />
      <path d="M4 -40 C 14 -30 16 -14 12 -2" stroke="#c8a964" strokeWidth="3" fill="none" strokeLinecap="round" />
      {label && (
        <text x="-2" y="-16" textAnchor="middle" fontSize="12" fontWeight="800" fontFamily="Georgia, serif" fill={INK}>
          {label}
        </text>
      )}
    </g>
  );
}

function Barn({ x, y, ids, s = 1 }: { x: number; y: number; ids: Ids; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-56 0 L -56 -58 L 0 -92 L 56 -58 L 56 0 Z" fill={CREAM} {...ink} />
      <path d="M-66 -52 L 0 -98 L 66 -52" fill="none" {...ink} strokeWidth={5} />
      <path d="M-56 -58 L 0 -92 L 56 -58 L 56 0 L 30 0 L 30 -60 Z" fill={`url(#${ids.dots})`} opacity="0.35" />
      <rect x="-20" y="-44" width="40" height="44" fill={LEAF} {...ink} />
      <path d="M-20 -44 L 20 0 M20 -44 L -20 0" {...ink} strokeWidth={2.4} />
      <circle cx="0" cy="-70" r="7" fill={MAIZE} {...ink} strokeWidth={2.4} />
    </g>
  );
}

function Coin({ x, y, r = 13 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={MAIZE} {...ink} />
      <circle cx={x} cy={y} r={r - 4.5} fill="none" stroke={MAIZE_DEEP} strokeWidth="2" />
      <text x={x} y={y + r * 0.38} textAnchor="middle" fontSize={r * 1.05} fontWeight="800" fontFamily="Georgia, serif" fill={INK}>
        $
      </text>
    </g>
  );
}

/** Little lines that say "this is moving" or "look here". */
function Spark({ x, y, r = 14, rotate = 0 }: { x: number; y: number; r?: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`} {...ink} strokeWidth={2.6}>
      <path d={`M0 ${-r} L 0 ${-r - 9}`} />
      <path d={`M${r * 0.8} ${-r * 0.55} L ${r * 0.8 + 7} ${-r * 0.55 - 6}`} />
      <path d={`M${-r * 0.8} ${-r * 0.55} L ${-r * 0.8 - 7} ${-r * 0.55 - 6}`} />
    </g>
  );
}

function Dot({ x, y, r = 3.5 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={INK} />;
}

function Phone({ x, y, ids }: { x: number; y: number; ids: Ids }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(8)`}>
      <rect x="-24" y="-46" width="48" height="84" rx="10" fill={INK} {...ink} />
      <rect x="-18" y="-38" width="36" height="64" rx="5" fill={CREAM} />
      <rect x="-18" y="6" width="36" height="20" fill={`url(#${ids.dots})`} opacity="0.4" />
      <path d="M-10 -10 l 7 7 l 14 -16" fill="none" stroke={LEAF_DEEP} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="-9" y="14" width="18" height="6" rx="3" fill={MAIZE} {...ink} strokeWidth={1.8} />
    </g>
  );
}

function Clipboard({ x, y, ticks = 3 }: { x: number; y: number; ticks?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-6)`}>
      <rect x="-30" y="-44" width="60" height="78" rx="6" fill={CREAM} {...ink} />
      <rect x="-12" y="-50" width="24" height="12" rx="3" fill={LEAF} {...ink} strokeWidth={2.4} />
      {Array.from({ length: ticks }, (_, i) => (
        <g key={i}>
          <path d={`M-20 ${-22 + i * 18} l 5 5 l 9 -10`} fill="none" stroke={LEAF_DEEP} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M-2 ${-20 + i * 18} L 20 ${-20 + i * 18}`} {...ink} strokeWidth={2.4} />
        </g>
      ))}
    </g>
  );
}

/* ───────────────────────────── The scenes ───────────────────────────── */

const SCENES: Record<IllustrationName, (ids: Ids) => ReactNode> = {
  welcome: (ids) => (
    <>
      <Barn x={232} y={168} ids={ids} />
      <Sack x={168} y={170} s={0.85} label="A" />
      <Cob x={96} y={150} arms="wave" ids={ids} hat />
      <Spark x={150} y={58} r={10} rotate={20} />
      <Dot x={36} y={60} />
      <Dot x={300} y={50} r={3} />
    </>
  ),
  info: (ids) => (
    <>
      <g filter={`url(#${ids.rough})`}>
        <circle cx="218" cy="80" r="44" fill={CREAM} {...ink} />
        <circle cx="218" cy="80" r="44" fill={`url(#${ids.dots})`} opacity="0.25" />
        <text x="218" y="104" textAnchor="middle" fontSize="66" fontStyle="italic" fontWeight="800" fontFamily="Georgia, serif" fill={INK}>
          i
        </text>
      </g>
      <Spark x={218} y={34} r={12} />
      <Cob x={112} y={168} arms="point" ids={ids} />
      <Dot x={290} y={140} />
    </>
  ),
  wallet: (ids) => (
    <>
      <Cob x={120} y={168} arms="hold" ids={ids} />
      <Phone x={212} y={108} ids={ids} />
      <Spark x={212} y={58} r={12} rotate={8} />
      <Dot x={50} y={70} />
    </>
  ),
  roles: (ids) => (
    <>
      <Cob x={84} y={166} arms="rest" ids={ids} scale={0.78} hat />
      <Sack x={124} y={168} s={0.6} />
      <Cob x={176} y={166} arms="hold" ids={ids} scale={0.78} />
      <Coin x={212} y={136} r={11} />
      <Cob x={262} y={166} arms="wave" ids={ids} scale={0.78} />
      <Spark x={212} y={118} r={8} />
    </>
  ),
  money: (ids) => (
    <>
      <Cob x={110} y={168} arms="cheer" ids={ids} />
      <Coin x={204} y={130} r={17} />
      <Coin x={236} y={112} r={17} />
      <Coin x={226} y={150} r={17} />
      <Coin x={170} y={60} r={11} />
      <Spark x={226} y={88} r={14} rotate={-10} />
    </>
  ),
  deliver: (ids) => (
    <>
      <Barn x={262} y={170} ids={ids} s={0.8} />
      <g filter={`url(#${ids.rough})`}>
        <path d="M100 150 L 176 150 L 186 120 L 92 120 Z" fill={LEAF} {...ink} />
        <circle cx="168" cy="160" r="11" fill={CREAM} {...ink} />
        <path d="M100 136 L 62 120" {...ink} />
      </g>
      <Sack x={124} y={124} s={0.6} />
      <Sack x={156} y={124} s={0.6} />
      <Cob x={56} y={168} arms="hold" ids={ids} scale={0.82} />
      <path d="M200 140 L 214 140 M196 152 L 214 152" {...ink} strokeWidth={2.4} />
    </>
  ),
  warehouse: (ids) => (
    <>
      <Barn x={226} y={170} ids={ids} />
      <Cob x={66} y={168} arms="point" ids={ids} />
      <Clipboard x={142} y={112} ticks={2} />
      <g transform="translate(270 54) rotate(10)" filter={`url(#${ids.rough})`}>
        <rect x="-22" y="-18" width="44" height="36" rx="5" fill={MAIZE} {...ink} />
        <text x="0" y="10" textAnchor="middle" fontSize="26" fontWeight="800" fontFamily="Georgia, serif" fill={INK}>
          A
        </text>
      </g>
    </>
  ),
  advance: (ids) => (
    <>
      <Barn x={92} y={170} ids={ids} s={0.85} />
      <Sack x={92} y={170} s={0.55} />
      <path d="M150 104 Q 184 82 214 100" fill="none" {...ink} strokeDasharray="2 8" />
      <path d="M206 92 L 216 101 L 203 106" fill="none" {...ink} />
      <Cob x={252} y={168} arms="cheer" ids={ids} scale={0.9} />
      <Coin x={252} y={64} r={15} />
      <Spark x={252} y={42} r={10} />
    </>
  ),
  record: (ids) => (
    <>
      <Clipboard x={212} y={104} ticks={3} />
      <Cob x={110} y={168} arms="point" ids={ids} />
      <Spark x={240} y={40} r={10} rotate={14} />
    </>
  ),
  invest: (ids) => (
    <>
      <g filter={`url(#${ids.rough})`}>
        <path d="M168 120 L 268 120 L 256 168 L 180 168 Z" fill={CREAM} {...ink} />
        <path d="M168 120 L 268 120 L 256 168 L 222 168 Z" fill={`url(#${ids.dots})`} opacity="0.35" />
        <path d="M218 120 C 214 98 222 82 218 64" fill="none" stroke={LEAF_DEEP} strokeWidth="4" strokeLinecap="round" />
        <path d="M218 84 C 200 78 196 64 200 54 C 214 58 220 70 218 84 Z" fill={LEAF} {...ink} />
        <path d="M219 74 C 236 66 240 52 236 42 C 222 48 216 60 219 74 Z" fill={LEAF} {...ink} />
      </g>
      <Coin x={190} y={112} r={11} />
      <Coin x={246} y={112} r={11} />
      <Cob x={96} y={168} arms="hold" ids={ids} />
      <Spark x={226} y={34} r={8} />
    </>
  ),
  market: (ids) => (
    <>
      <g filter={`url(#${ids.rough})`}>
        <path d="M150 60 L 300 60 L 290 36 L 160 36 Z" fill={MAIZE} {...ink} />
        <path d="M170 36 L 166 60 M196 36 L 194 60 M222 36 L 222 60 M248 36 L 250 60 M274 36 L 278 60" {...ink} strokeWidth={2.4} />
        <rect x="160" y="60" width="130" height="106" fill={CREAM} {...ink} />
        <rect x="236" y="60" width="54" height="106" fill={`url(#${ids.dots})`} opacity="0.3" />
      </g>
      <Sack x={190} y={164} s={0.6} />
      <Sack x={226} y={164} s={0.6} label="B" />
      <Sack x={262} y={164} s={0.6} />
      <Cob x={86} y={168} arms="wave" ids={ids} />
    </>
  ),
  clock: (ids) => (
    <>
      <g filter={`url(#${ids.rough})`}>
        <circle cx="222" cy="92" r="52" fill={CREAM} {...ink} />
        <path d="M222 92 L 222 58 M222 92 L 246 104" {...ink} strokeWidth={4} />
        <circle cx="222" cy="92" r="4" fill={INK} />
        <path d="M188 160 L 256 160" {...ink} />
      </g>
      {["A", "B", "C"].map((g, i) => (
        <text key={g} x={290} y={58 + i * 34} fontSize="22" fontWeight="800" fontFamily="Georgia, serif" fill={i === 0 ? LEAF_DEEP : INK} opacity={1 - i * 0.25}>
          {g}
        </text>
      ))}
      <Cob x={100} y={168} arms="rest" ids={ids} />
    </>
  ),
  shield: (ids) => (
    <>
      <g filter={`url(#${ids.rough})`}>
        <path d="M222 30 L 272 48 L 272 92 Q 272 136 222 156 Q 172 136 172 92 L 172 48 Z" fill={LEAF} {...ink} />
        <path d="M222 30 L 272 48 L 272 92 Q 272 136 222 156 Z" fill={`url(#${ids.dots})`} opacity="0.35" />
        <path d="M198 92 l 16 16 l 30 -34" fill="none" stroke={CREAM} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Cob x={104} y={168} arms="cheer" ids={ids} />
      <Spark x={222} y={24} r={10} />
    </>
  ),
};

export function Illustration({ name }: { name: IllustrationName }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids: Ids = { rough: `rough${uid}`, dots: `dots${uid}`, clip: (n) => `clip${uid}${n.replace(/[^a-zA-Z0-9]/g, "")}` };
  return (
    <svg className="tour-art" viewBox="0 0 340 190" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        {/* A slight wobble, so lines look drawn by hand rather than by a ruler. */}
        <filter id={ids.rough} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="2.6" />
        </filter>
        {/* Halftone dots for shade. */}
        <pattern id={ids.dots} width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1.1" fill={INK} />
        </pattern>
      </defs>
      {/* The paper panel, with a soft ground under the scene. */}
      <rect x="2" y="2" width="336" height="186" rx="18" fill={PAPER} />
      <ellipse cx="170" cy="176" rx="150" ry="10" fill={`url(#${ids.dots})`} opacity="0.18" />
      {SCENES[name](ids)}
    </svg>
  );
}
