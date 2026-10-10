import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/BigShoulders";
import { loadFont as loadSans } from "@remotion/google-fonts/AtkinsonHyperlegibleNext";

import manifestJson from "../public/shots/manifest.json";
import { SCENES, type Scene, type Shot } from "./scenes";
import { captionLines, displayWords, estimateTiming, type Timings } from "./timing";

const display = loadDisplay("normal", { weights: ["700", "800"] }).fontFamily;
const sans = loadSans("normal", { weights: ["400", "700"] }).fontFamily;

/** AgriBridge's own palette (styles/globals.css): field green, maize, deep green panels. */
const C = { green: "#01603a", deep: "#0c3722", night: "#071f14", maize: "#f8c020", ink: "#13241b", cream: "#f3f6f4" };
type Box = { x: number; y: number; w: number; h: number };
const MANIFEST = manifestJson as Record<string, { url: string; targets: Record<string, Box> }>;

export const FPS = 30;
const LEAD = 0.5; // seconds of quiet before each scene's voice
const TAIL = 0.7; // and after it

/** The browser frame: screenshots are 1440×900 CSS px, shown 1400 wide. */
const FRAME = { x: 260, y: 34, w: 1400, chrome: 44 };
const SCALE = FRAME.w / 1440;
const SHOT_H = 900 * SCALE;

export const sceneFrames = (scene: Scene, timings: Timings) => Math.ceil(((timings[scene.id] ?? estimateTiming(scene)).duration + LEAD + TAIL) * FPS);

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function targetOf(shot: Shot, key?: string): Box | undefined {
  if (!key) return undefined;
  const name = shot.src.replace(/^shots\//, "").replace(/\.png$/, "");
  return MANIFEST[name]?.targets[key];
}

/** A cursor that glides to the click target, presses, and ripples as the next screen takes over. */
function Cursor({ target, frames }: { target: Box; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const to = { x: (target.x + target.w / 2) * SCALE, y: (target.y + target.h / 2) * SCALE };
  const from = { x: to.x - 220, y: to.y + 150 };
  const startMove = Math.round(frames * 0.35);
  const arrive = startMove + Math.round(0.8 * fps);
  const t = ease(interpolate(frame, [startMove, arrive], [0, 1], clamp));
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  const since = frame - arrive;
  const press = since >= 0 && since < 6 ? 0.88 : 1;
  const r = spring({ frame: Math.max(0, since), fps, config: { damping: 18 }, durationInFrames: 20 });
  const fadeIn = interpolate(frame, [startMove - 8, startMove], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: fadeIn, pointerEvents: "none" }}>
      {since >= 0 && since < 22 && (
        <div
          style={{
            position: "absolute",
            left: to.x,
            top: to.y,
            width: 16 + r * 70,
            height: 16 + r * 70,
            transform: "translate(-50%,-50%)",
            borderRadius: "50%",
            border: `3px solid ${C.maize}`,
            opacity: 1 - r,
          }}
        />
      )}
      <svg width="34" height="34" viewBox="0 0 28 28" style={{ position: "absolute", left: x - 4, top: y - 3, transform: `scale(${press})`, transformOrigin: "4px 3px", filter: "drop-shadow(0 3px 4px rgba(0,0,0,.45))" }}>
        <path d="M3 2 L3 21 L9 15 L13 24 L16 23 L12 14 L20 14 Z" fill="#fff" stroke="#111" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

/** One screenshot in the browser frame, with an optional zoom toward a target and a click. */
function BrowserShot({ shot, frames, label }: { shot: Shot; frames: number; label: string }) {
  const frame = useCurrentFrame();
  const zoomTo = targetOf(shot, shot.zoom);
  const clickAt = targetOf(shot, shot.click);
  // Zoom: ease toward the target over the first third, then hold. Live shots drift gently instead.
  const z = ease(interpolate(frame, [Math.round(frames * 0.12), Math.round(frames * 0.45)], [0, 1], clamp));
  let scale = 1;
  let origin = "50% 40%";
  if (zoomTo) {
    const fit = Math.min(1.55, Math.max(1.12, (1440 * 0.62) / Math.max(zoomTo.w, 200)));
    scale = 1 + (fit - 1) * z;
    origin = `${(zoomTo.x + zoomTo.w / 2) * SCALE}px ${(zoomTo.y + zoomTo.h / 2) * SCALE}px`;
  } else if (!shot.click) {
    scale = interpolate(frame, [0, frames], [1, 1.05], clamp);
  }
  return (
    <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, borderRadius: 14, overflow: "hidden", boxShadow: "0 40px 90px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08)", background: "#fff" }}>
      <div style={{ height: FRAME.chrome, background: "#1d2a23", display: "flex", alignItems: "center", gap: 9, padding: "0 16px" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />
        ))}
        <div style={{ marginLeft: 14, flex: 1, height: 28, borderRadius: 7, background: "#2c3a32", color: "#b9c8bf", fontFamily: sans, fontSize: 16, display: "flex", alignItems: "center", padding: "0 12px" }}>
          🔒&nbsp; {shot.url}
        </div>
        <div style={{ marginLeft: 12, padding: "5px 14px", borderRadius: 999, background: C.maize, color: C.ink, fontFamily: sans, fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>{label}</div>
      </div>
      <div style={{ position: "relative", height: SHOT_H, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, transform: `scale(${scale})`, transformOrigin: origin }}>
          <Img src={staticFile(shot.src)} style={{ width: FRAME.w, height: SHOT_H, display: "block" }} />
          {clickAt && <Cursor target={clickAt} frames={frames} />}
        </div>
      </div>
    </div>
  );
}

/** Full-frame cards: the title, the flow diagram, the security summary and the end card. */
function Card({ shot, frames }: { shot: Shot; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = (delay: number) => {
    const s = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 18 });
    return { opacity: s, transform: `translateY(${(1 - s) * 18}px)` } as CSSProperties;
  };
  const bg = (
    <AbsoluteFill>
      <Img src={staticFile(shot.src)} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: shot.card === "flow" ? 0 : 0.3, filter: "blur(14px) saturate(1.2)", transform: `scale(${interpolate(frame, [0, frames], [1.04, 1.1])})` }} />
      <AbsoluteFill style={{ background: `linear-gradient(110deg, ${C.night} 10%, ${C.deep}ee 55%, ${C.deep}aa)` }} />
    </AbsoluteFill>
  );
  if (shot.card === "flow") {
    return (
      <AbsoluteFill>
        {bg}
        <div style={{ position: "absolute", left: 160, top: 90, fontFamily: display, fontWeight: 800, fontSize: 84, color: "#fff", ...rise(0) }}>How AgriBridge works</div>
        <div style={{ position: "absolute", left: 160, top: 260, width: 1600, borderRadius: 18, overflow: "hidden", background: "#fff", ...rise(10) }}>
          <Img src={staticFile(shot.src)} style={{ width: "100%", display: "block" }} />
        </div>
      </AbsoluteFill>
    );
  }
  if (shot.card === "security") {
    const points = ["Only the warehouse Safe can create crop", "Loans valued at the end date, settled at 80%", "Prices checked: median, quorum, move cap", "Guarded against reentrancy and flash loans", "More than 250 automated contract tests"];
    return (
      <AbsoluteFill>
        {bg}
        <div style={{ position: "absolute", left: 160, top: 120, fontFamily: display, fontWeight: 800, fontSize: 84, color: "#fff", ...rise(0) }}>Built to be trusted</div>
        {points.map((p, i) => (
          <div key={p} style={{ position: "absolute", left: 170, top: 290 + i * 104, display: "flex", alignItems: "center", gap: 26, fontFamily: sans, fontSize: 40, color: "#e6efe9", ...rise(8 + i * 8) }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: C.maize, flexShrink: 0 }} />
            {p}
          </div>
        ))}
      </AbsoluteFill>
    );
  }
  const end = shot.card === "end";
  return (
    <AbsoluteFill>
      {bg}
      <div style={{ position: "absolute", left: 160, top: end ? 250 : 300, display: "flex", alignItems: "center", gap: 30, ...rise(0) }}>
        <Img src={staticFile("logo.svg")} style={{ width: 120, height: 120 }} />
        <span style={{ fontFamily: display, fontWeight: 800, fontSize: 120, color: "#fff" }}>AgriBridge</span>
      </div>
      <div style={{ position: "absolute", left: 164, top: end ? 430 : 480, fontFamily: display, fontWeight: 700, fontSize: 70, color: C.maize, ...rise(10) }}>Crop in storage becomes money farmers can use.</div>
      {end ? (
        <>
          <div style={{ position: "absolute", left: 164, top: 580, fontFamily: sans, fontSize: 44, color: "#e6efe9", ...rise(20) }}>Live on Ethereum Sepolia · sign in with MetaMask</div>
          <div style={{ position: "absolute", left: 164, top: 680, padding: "18px 34px", borderRadius: 16, background: C.maize, color: C.ink, fontFamily: sans, fontWeight: 700, fontSize: 48, ...rise(30) }}>agribridge-lilac.vercel.app</div>
        </>
      ) : (
        <div style={{ position: "absolute", left: 164, top: 600, fontFamily: sans, fontSize: 36, color: "#cfe0d6", letterSpacing: 2, textTransform: "uppercase", ...rise(20) }}>The Agri-Token Exchange · product demo</div>
      )}
    </AbsoluteFill>
  );
}

/** Captions burned in under the frame, phrase by phrase, timed to the voice. */
function Captions({ scene, timings }: { scene: Scene; timings: Timings }) {
  const frame = useCurrentFrame();
  const timing = timings[scene.id] ?? estimateTiming(scene);
  const t = frame / FPS - LEAD;
  const line = captionLines(displayWords(scene, timing)).find((l) => t >= l.start - 0.05 && t < l.end);
  if (!line) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 1000, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 1500, padding: "10px 26px", borderRadius: 12, background: "rgba(4,16,10,.82)", color: "#fff", fontFamily: sans, fontWeight: 700, fontSize: 38, lineHeight: 1.25, textAlign: "center" }}>{line.text}</div>
    </div>
  );
}

function SceneView({ scene, timings }: { scene: Scene; timings: Timings }) {
  const total = sceneFrames(scene, timings);
  const weights = scene.shots.map((s) => s.weight ?? 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  let at = 0;
  const timing = timings[scene.id];
  return (
    <AbsoluteFill>
      {scene.shots.map((shot, i) => {
        const len = i === scene.shots.length - 1 ? total - at : Math.round((total * weights[i]) / sum);
        const from = at;
        at += len;
        return (
          <Sequence key={i} from={from} durationInFrames={len + (i < scene.shots.length - 1 ? 8 : 0)}>
            <Fade frames={len + (i < scene.shots.length - 1 ? 8 : 0)} fadeIn={i > 0}>
              {shot.card ? <Card shot={shot} frames={len} /> : <BrowserShot shot={shot} frames={len} label={scene.label} />}
            </Fade>
          </Sequence>
        );
      })}
      {timing?.audio && (
        <Sequence from={Math.round(LEAD * FPS)}>
          <Audio src={staticFile(timing.audio)} />
        </Sequence>
      )}
      <Captions scene={scene} timings={timings} />
    </AbsoluteFill>
  );
}

function Fade({ frames, fadeIn, children }: { frames: number; fadeIn: boolean; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = fadeIn ? interpolate(frame, [0, 8], [0, 1], clamp) : 1;
  return <AbsoluteFill style={{ opacity: Math.min(opacity, interpolate(frame, [frames - 1, frames], [1, 1], clamp)) }}>{children}</AbsoluteFill>;
}

export function Demo({ timings }: { timings: Timings }) {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 20%, ${C.deep}, ${C.night} 70%)` }}>
      {SCENES.map((scene) => {
        const len = sceneFrames(scene, timings);
        const from = at;
        at += len;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={len} name={scene.label}>
            <SceneView scene={scene} timings={timings} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
