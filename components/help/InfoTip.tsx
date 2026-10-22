import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { HELP, type HelpId } from "../../lib/help";

const CARD_WIDTH = 320;
const GAP = 8;

/**
 * The "i" button: tap it beside any word or control for a plain-English note on what it is, why it
 * matters and what to do. The note opens in a layer above the page, so it is never clipped by a
 * table or a card, and closes with Escape, a second tap, or a tap anywhere else.
 */
export function InfoTip({ id, className }: { id: HelpId; className?: string }) {
  const topic = HELP[id];
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; side: "below" | "above"; caret: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const cardId = useId();

  const position = useCallback(() => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(CARD_WIDTH, window.innerWidth - 2 * GAP);
    const left = Math.min(Math.max(GAP, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - GAP);
    const height = card.current?.offsetHeight ?? 240;
    // Below the button when there is room, otherwise above it; the pointer lines up with the button.
    const below = rect.bottom + GAP + 6 + height <= window.innerHeight || rect.top < height + GAP + 6;
    const caret = Math.min(Math.max(18, rect.left + rect.width / 2 - left), width - 18);
    setPlace({ top: below ? rect.bottom + GAP + 6 : rect.top - height - GAP - 6, left, side: below ? "below" : "above", caret });
  }, []);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!card.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, position]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`info-tip${className ? ` ${className}` : ""}`}
        aria-label={`What is "${topic.title}"?`}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        data-testid={`info-${id}`}
        data-tour="info-icon"
        onClick={(e) => {
          // Inside a label or a link, the tap is only for the note.
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={card}
            id={cardId}
            role="dialog"
            aria-label={topic.title}
            tabIndex={-1}
            className="info-card"
            data-testid="info-card"
            data-side={place?.side}
            style={
              {
                top: place?.top ?? -9999,
                left: place?.left ?? -9999,
                width: Math.min(CARD_WIDTH, window.innerWidth - 2 * GAP),
                "--caret-x": `${place?.caret ?? CARD_WIDTH / 2}px`,
              } as React.CSSProperties
            }
          >
            <div className="info-card-head">
              <span className="info-card-glyph" aria-hidden="true">
                i
              </span>
              <p className="info-card-title">{topic.title}</p>
            </div>
            <dl>
              <div>
                <dt>What it is</dt>
                <dd>{topic.what}</dd>
              </div>
              <div>
                <dt>Why it matters to you</dt>
                <dd>{topic.why}</dd>
              </div>
              <div className="info-row-do">
                <dt>What to do</dt>
                <dd>{topic.todo}</dd>
              </div>
            </dl>
            <Link href="/help" className="link info-card-more" onClick={() => setOpen(false)}>
              Every word explained →
            </Link>
          </div>,
          document.body,
        )}
    </>
  );
}

/** A label followed by its "i" button, kept on one line. */
export function WithInfo({ id, children }: { id: HelpId; children: React.ReactNode }) {
  return (
    <span className="with-info">
      {children}
      <InfoTip id={id} />
    </span>
  );
}
