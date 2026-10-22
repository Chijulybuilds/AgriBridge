import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/router";
import { useConnection } from "wagmi";
import { AcademicCapIcon, ArrowLeftIcon, ArrowRightIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { SECTION_TOURS, APP_TOUR, type SectionId, type Tour, type TourLength, type TourStep } from "../../lib/tours";
import { Illustration } from "./Illustration";

/*
 * The tutorial: a guided walk on the real screen. The page dims, a ring circles the button that
 * matters, and a card says in plain words what it is and what pressing it does. A step on another
 * page opens that page first; when its button can't be shown (before signing in, say), the step is
 * shown in the middle with its picture instead.
 *
 * First visit: a welcome card offers the short tour, the full tour, or skipping. Each section
 * (farmer, investor, market...) plays its own short tour the first time it is opened. Everything
 * can be replayed from the Tutorial button and each page's "How this page works" button.
 */

const SEEN_KEY = "agribridge.tutorial.seen.v1";
/** The tour in progress, kept for this browser tab so a page reload carries on where it was. */
const RUN_KEY = "agribridge.tutorial.run";
/** Pages anyone can open; before signing in, a tour step on any other page is shown with its picture. */
const PUBLIC_PAGES = ["/", "/login", "/market", "/activity", "/help"];

/** Set by the automated tests, so tours never cover the screens they drive. */
const OFF_KEY = "agribridge.tutorial.off";

function readSeen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [key]: true }));
  } catch {
    // Private windows may refuse storage; the tour then simply offers itself again next time.
  }
}

function autoToursOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
}

type Running = { tour: Tour; length: TourLength; steps: TourStep[]; index: number };

function tourById(id: string): Tour | undefined {
  return id === APP_TOUR.id ? APP_TOUR : SECTION_TOURS[id as SectionId];
}

function saveRun(run: Running | null) {
  try {
    if (run) sessionStorage.setItem(RUN_KEY, JSON.stringify({ id: run.tour.id, length: run.length, index: run.index }));
    else sessionStorage.removeItem(RUN_KEY);
  } catch {
    // Without storage, a reload simply ends the tour.
  }
}

function restoreRun(): Running | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RUN_KEY) ?? "null") as { id: string; length: TourLength; index: number } | null;
    const tour = saved ? tourById(saved.id) : undefined;
    if (!saved || !tour) return null;
    const steps = tour[saved.length];
    return { tour, length: saved.length, steps, index: Math.min(saved.index, steps.length - 1) };
  } catch {
    return null;
  }
}

type TutorialApi = {
  /** Opens the welcome card: short tour, full tour, or skip. */
  openChooser: () => void;
  start: (tour: Tour, length: TourLength) => void;
  startSection: (section: SectionId) => void;
  /** Plays a section's tour the first time that section is opened. */
  autoSection: (section: SectionId) => void;
  running: boolean;
};

const TutorialContext = createContext<TutorialApi | null>(null);

export function useTutorial(): TutorialApi {
  const api = useContext(TutorialContext);
  if (!api) throw new Error("useTutorial must be used inside TutorialProvider");
  return api;
}

/** Plays `section`'s tour the first time the page is opened. */
export function useSectionTour(section: SectionId) {
  const { autoSection } = useTutorial();
  useEffect(() => {
    const timer = setTimeout(() => autoSection(section), 700);
    return () => clearTimeout(timer);
  }, [autoSection, section]);
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [chooser, setChooser] = useState(false);
  const [run, setRun] = useState<Running | null>(null);

  // Carry on a tour that a page reload interrupted.
  useEffect(() => {
    const restored = restoreRun();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session storage is only readable after mount
    if (restored) setRun(restored);
  }, []);
  useEffect(() => saveRun(run), [run]);

  // The welcome card, once, on the first visit to any public page (never on the verifier's page).
  useEffect(() => {
    if (!router.isReady || router.pathname.startsWith("/verifier") || autoToursOff()) return;
    if (!readSeen().welcome) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- shown once, after storage is readable
      setChooser(true);
    }
  }, [router.isReady, router.pathname]);

  const start = useCallback((tour: Tour, length: TourLength) => {
    markSeen("welcome");
    markSeen(`section:${tour.id}`);
    setChooser(false);
    setRun({ tour, length, steps: tour[length], index: 0 });
  }, []);

  const startSection = useCallback((section: SectionId) => start(SECTION_TOURS[section], "full"), [start]);

  const autoSection = useCallback(
    (section: SectionId) => {
      if (autoToursOff() || run || chooser) return;
      const seen = readSeen();
      // Someone who hasn't answered the welcome card yet sees that first.
      if (!seen.welcome || seen[`section:${section}`]) return;
      start(SECTION_TOURS[section], "full");
    },
    [run, chooser, start],
  );

  const api = useMemo<TutorialApi>(
    () => ({ openChooser: () => setChooser(true), start, startSection, autoSection, running: run !== null }),
    [start, startSection, autoSection, run],
  );

  return (
    <TutorialContext.Provider value={api}>
      {children}
      {chooser && (
        <Chooser
          onPick={(length) => start(APP_TOUR, length)}
          onSkip={() => {
            markSeen("welcome");
            setChooser(false);
          }}
        />
      )}
      {run && (
        // A fresh overlay per step: it starts out searching for the step's button, with no ring.
        <TourOverlay
          key={`${run.tour.id}-${run.index}`}
          run={run}
          onMove={(index) => setRun((r) => (r ? { ...r, index } : r))}
          onClose={() => setRun(null)}
        />
      )}
    </TutorialContext.Provider>
  );
}

/** The Tutorial button for the top of every page. */
export function TutorialButton() {
  const { openChooser } = useTutorial();
  return (
    <button type="button" className="btn btn-small btn-secondary tutorial-btn" onClick={openChooser} data-tour="tutorial-button" data-testid="tutorial-button">
      <AcademicCapIcon aria-hidden="true" />
      <span>Tutorial</span>
    </button>
  );
}

/** "How this page works": replays this section's tour. */
export function PageTourButton({ section }: { section: SectionId }) {
  const { startSection } = useTutorial();
  return (
    <button type="button" className="btn btn-small btn-ghost" onClick={() => startSection(section)} data-testid="page-tour">
      <AcademicCapIcon aria-hidden="true" style={{ width: 16, height: 16 }} />
      How this page works
    </button>
  );
}

/* ─────────────────────────── The welcome card ─────────────────────────── */

function Chooser({ onPick, onSkip }: { onPick: (length: TourLength) => void; onSkip: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onSkip();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  return createPortal(
    // A tap anywhere outside the card counts as "Skip for now".
    <div className="tour-layer tour-dim" data-testid="tutorial-chooser" onClick={(e) => e.target === e.currentTarget && onSkip()}>
      <div className="tour-card tour-card-center" role="dialog" aria-modal="true" aria-labelledby="tour-welcome-title">
        <span className="tour-welcome-eyebrow">AgriBridge · field guide</span>
        <Illustration name="welcome" />
        <h2 id="tour-welcome-title" className="tour-title tour-welcome-title">
          Welcome to AgriBridge
        </h2>
        <p className="tour-body tour-welcome-lede">
          Get cash for crop kept in a warehouse, sell it, or invest in farmers. We can show you around, step by step.
        </p>
        <div className="tour-choices">
          <button ref={first} type="button" className="tour-choice tour-choice-primary" onClick={() => onPick("short")} data-testid="tour-short">
            <span className="tour-choice-name">Show me quickly</span>
            <span className="tour-choice-note">About 2 minutes · {APP_TOUR.short.length} steps</span>
          </button>
          <button type="button" className="tour-choice" onClick={() => onPick("full")} data-testid="tour-full">
            <span className="tour-choice-name">Teach me everything</span>
            <span className="tour-choice-note">About 10 minutes · {APP_TOUR.full.length} steps</span>
          </button>
        </div>
        <button type="button" className="btn btn-small btn-secondary tour-skip" onClick={onSkip} data-testid="tour-skip">
          <XMarkIcon aria-hidden="true" style={{ width: 16, height: 16 }} /> Skip for now
        </button>
        <p className="tour-foot">Or tap anywhere outside this card. You can start the tour again any time with the Tutorial button at the top.</p>
      </div>
    </div>,
    document.body,
  );
}

/* ─────────────────────────── The tour itself ─────────────────────────── */

type Rect = { top: number; left: number; width: number; height: number };

/** The first copy of a target that is on screen (the menu, for one, exists twice: desktop and phone). */
function findVisible(target: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    if (el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

const PAD = 8;

function TourOverlay({ run, onMove, onClose }: { run: Running; onMove: (index: number) => void; onClose: () => void }) {
  const router = useRouter();
  const { isConnected } = useConnection();
  const step = run.steps[run.index];
  const last = run.index === run.steps.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  const [searching, setSearching] = useState(true);
  const card = useRef<HTMLDivElement>(null);

  // Go to the step's page if it has one, then find its button (waiting a little for the page).
  useEffect(() => {
    let cancelled = false;
    async function find() {
      // Before signing in, private pages would only send people back to sign-in: show the picture instead.
      const canOpen = step.page && (isConnected || PUBLIC_PAGES.includes(step.page));
      if (canOpen && router.pathname !== step.page) await router.push(step.page!);
      else if (step.page && !canOpen) return setSearching(false);
      if (!step.target) return setSearching(false);
      for (let i = 0; i < 20 && !cancelled; i++) {
        const el = findVisible(step.target);
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
          if (!cancelled) {
            measure();
            setSearching(false);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!cancelled) setSearching(false); // not on this screen: shown in the middle with its picture
    }
    void find();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per step
  }, [run.index, run.tour.id]);

  function measure() {
    if (!step.target) return setRect(null);
    const el = findVisible(step.target);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD });
  }

  useEffect(() => {
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && !last) onMove(run.index + 1);
      if (e.key === "ArrowLeft" && run.index > 0) onMove(run.index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run.index, last, onMove, onClose]);

  useEffect(() => {
    if (!searching) card.current?.focus();
  }, [searching, run.index]);

  const position = useCardPosition(rect, card);
  const tether = useTether(rect, card, position);
  const picture = !rect || step.alwaysShowPicture ? step.picture : undefined;

  return createPortal(
    // A tap outside the card closes the tour (it can be replayed from the Tutorial button).
    <div
      className={`tour-layer${rect ? "" : " tour-dim"}`}
      data-testid="tutorial"
      data-step={run.index + 1}
      onClick={(e) => !card.current?.contains(e.target as Node) && onClose()}
    >
      {rect && (
        <div className="tour-ring" style={rect} aria-hidden="true">
          <span className="tour-corner tl" />
          <span className="tour-corner tr" />
          <span className="tour-corner bl" />
          <span className="tour-corner br" />
        </div>
      )}
      {rect && tether && (
        <svg className="tour-tether" aria-hidden="true">
          <line x1={tether.x1} y1={tether.y1} x2={tether.x2} y2={tether.y2} />
          <circle cx={tether.x2} cy={tether.y2} r={4} />
          <circle cx={tether.x1} cy={tether.y1} r={3} />
        </svg>
      )}
      <div
        ref={card}
        className={`tour-card${rect ? "" : " tour-card-center"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        tabIndex={-1}
        style={rect ? position : undefined}
      >
        <div className="tour-head">
          <span className="tour-eyebrow">{run.tour.title}</span>
          <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <span className="tour-stamp" aria-live="polite">
              Step {run.index + 1} of {run.steps.length}
            </span>
            <button type="button" className="icon-btn tour-close" onClick={onClose} aria-label="Close the tutorial" data-testid="tour-close">
              <XMarkIcon aria-hidden="true" />
            </button>
          </span>
        </div>
        <ol className="tour-dots" aria-hidden="true">
          {run.steps.map((_, i) => (
            <li key={i} className={i < run.index ? "done" : i === run.index ? "now" : undefined} />
          ))}
        </ol>
        {picture &&
          (typeof picture === "string" ? (
            <Illustration name={picture} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- static screenshots, already sized
            <img className="tour-shot" src={picture.src} alt={picture.alt} />
          ))}
        <h2 id="tour-step-title" className="tour-title">
          {step.title}
        </h2>
        <div id="tour-step-body" className="tour-body">
          <p>{step.body}</p>
          {step.press && (
            <p className="tour-press">
              <span className="tour-press-label">When you press it</span>
              {step.press}
            </p>
          )}
        </div>
        <div className="tour-actions">
          <button type="button" className="btn btn-small btn-ghost" disabled={run.index === 0} onClick={() => onMove(run.index - 1)} data-testid="tour-back">
            <ArrowLeftIcon aria-hidden="true" /> Back
          </button>
          <button
            type="button"
            className="btn tour-next"
            onClick={() => (last ? onClose() : onMove(run.index + 1))}
            data-testid="tour-next"
            disabled={searching}
          >
            {last ? "Finish" : "Next"} {!last && <ArrowRightIcon aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The string from the card to the ring: from the card's nearest edge to the ring's nearest point. */
function useTether(rect: Rect | null, card: React.RefObject<HTMLDivElement | null>, position: React.CSSProperties) {
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  useLayoutEffect(() => {
    if (!rect || !card.current || window.innerWidth < 640) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- measured from the laid-out card
      setLine(null);
      return;
    }
    const c = card.current.getBoundingClientRect();
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    // The point on each box closest to the other box's centre.
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    const rx = rect.left + rect.width / 2;
    const ry = rect.top + rect.height / 2;
    const x1 = clamp(rx, c.left + 16, c.right - 16);
    const y1 = clamp(ry, c.top + 16, c.bottom - 16);
    const x2 = clamp(cx, rect.left, rect.left + rect.width);
    const y2 = clamp(cy, rect.top, rect.top + rect.height);
    // Only when the card stands clear of the target; an overlapping string would be noise.
    const apart = Math.hypot(x2 - x1, y2 - y1) > 24;
    setLine(apart ? { x1, y1, x2, y2 } : null);
  }, [rect, card, position]);
  return line;
}

/** Places the card beside the ring: below it if there is room, otherwise above, kept on screen. */
function useCardPosition(rect: Rect | null, card: React.RefObject<HTMLDivElement | null>) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!rect || !card.current) return;
    const w = card.current.offsetWidth;
    const h = card.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 640) {
      // Phones: the card docks to the bottom, away from the ring when it can.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- layout depends on measured sizes
      setStyle(rect.top + rect.height / 2 > vh / 2 ? { top: 12, left: 12, right: 12 } : { bottom: 12, left: 12, right: 12 });
      return;
    }
    const clampTop = (t: number) => Math.min(Math.max(12, t), vh - h - 12);
    const below = rect.top + rect.height + 12;
    const above = rect.top - h - 12;
    const centredLeft = Math.min(Math.max(12, rect.left + rect.width / 2 - w / 2), vw - w - 12);
    if (below + h <= vh - 12) return setStyle({ top: below, left: centredLeft });
    if (above >= 12) return setStyle({ top: above, left: centredLeft });
    // A tall card that fits neither below nor above goes beside the ring, so it never covers it.
    const besideTop = clampTop(rect.top + rect.height / 2 - h / 2);
    if (rect.left - w - 12 >= 12) return setStyle({ top: besideTop, left: rect.left - w - 12 });
    if (rect.left + rect.width + 12 + w <= vw - 12) return setStyle({ top: besideTop, left: rect.left + rect.width + 12 });
    setStyle({ top: clampTop(below), left: centredLeft });
  }, [rect, card]);
  return style;
}
