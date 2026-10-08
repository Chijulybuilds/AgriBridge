import { useId, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode, type SVGProps } from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { m } from "motion/react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type Tone = "green" | "gold" | "red" | "blue" | "muted";

/** Page title, with a small eyebrow above it and one plain-language line on what the page is for. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header spread" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
      <div>
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, actions, testId }: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <section className="card" data-testid={testId}>
      {(title || actions) && (
        <div className="spread" style={{ marginBottom: 16, flexWrap: "wrap" }}>
          {title && <h2 style={{ marginBottom: 0 }}>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * One figure in a page's row of figures. `lead` makes the figure that matters most on the page
 * larger; `alert` colours it red, and is kept for things that need action (advances at risk).
 * When a figure changes after a transaction or a refresh, it is marked for a moment so the eye
 * finds what moved; a figure appearing for the first time is not.
 */
export function Stat({
  label,
  value,
  sub,
  icon: IconComponent,
  lead,
  alert,
  testId,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: Icon;
  lead?: boolean;
  alert?: boolean;
  testId?: string;
}) {
  const changes = useChangeCount(value);
  return (
    <div className={`stat${lead ? " stat-lead" : ""}${alert ? " stat-alert" : ""}`}>
      <div className="stat-label">
        {IconComponent && <IconComponent aria-hidden="true" />}
        {label}
      </div>
      <div className="stat-value" data-testid={testId}>
        <span key={changes} className={changes ? "value-changed" : undefined}>
          {value}
        </span>
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Counts changes to a displayed figure, ignoring placeholders such as "—" while it loads. */
function useChangeCount(value: ReactNode) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  const [seen, setSeen] = useState(text);
  const [changes, setChanges] = useState(0);
  if (text !== seen) {
    setSeen(text);
    if (seen !== undefined && text !== undefined && /\d/.test(seen) && /\d/.test(text)) setChanges(changes + 1);
  }
  return changes;
}

export function Badge({ tone = "muted", children, plain }: { tone?: Tone; children: ReactNode; plain?: boolean }) {
  return <span className={`badge badge-${tone}${plain ? " badge-plain" : ""}`}>{children}</span>;
}

/** The colour a status word gets wherever it appears. */
export function StatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "Verified" || status === "Released" || status === "Repaid" || status === "Active" || status === "Open"
      ? "green"
      : status === "Pending" || status === "Awaiting warehouse"
        ? "gold"
        : status === "Rejected" || status === "Liquidated" || status === "Frozen" || status === "Expired"
          ? "red"
          : "muted";
  return <Badge tone={tone}>{status}</Badge>;
}

const NOTICE_ICONS: Record<string, Icon> = {
  info: InformationCircleIcon,
  warn: ExclamationTriangleIcon,
  danger: XCircleIcon,
  ok: CheckCircleIcon,
};

export function Notice({ tone = "info", children, testId }: {
  tone?: "info" | "warn" | "danger" | "ok";
  children: ReactNode;
  testId?: string;
}) {
  const cls = tone === "info" ? "notice" : `notice notice-${tone}`;
  const IconComponent = NOTICE_ICONS[tone];
  return (
    <div className={cls} data-testid={testId}>
      <IconComponent />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** What a list shows when it has nothing in it: an icon, a line, and the next step if there is one. */
export function EmptyState({ children, icon: IconComponent, title, action }: {
  children?: ReactNode;
  icon?: Icon;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {IconComponent && (
        <span className="empty-icon">
          <IconComponent />
        </span>
      )}
      {title && <strong>{title}</strong>}
      {children && <div style={{ maxWidth: 460, lineHeight: 1.6 }}>{children}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

/** Grey placeholder rows while the chain is being read. */
export function Skeleton({ rows = 3, height = 18 }: { rows?: number; height?: number }) {
  return (
    <div className="stack" style={{ gap: 10 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function KeyValue({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <span data-testid={testId}>{value}</span>
    </div>
  );
}

/**
 * Tabs that follow the ARIA pattern: one tab stop for the whole row, arrow keys
 * (and Home/End) move between tabs, and each tab names the panel it shows.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const indicator = useId();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = tabs.findIndex((tab) => tab.id === value);
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight" ? (current === last ? 0 : current + 1)
      : event.key === "ArrowLeft" ? (current === 0 ? last : current - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : undefined;
    if (next === undefined) return;
    event.preventDefault();
    onChange(tabs[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <m.div layoutScroll className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          id={`tab-${tab.id}`}
          type="button"
          className="tab"
          role="tab"
          aria-selected={tab.id === value}
          aria-controls={`panel-${tab.id}`}
          tabIndex={tab.id === value ? 0 : -1}
          data-testid={`tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {/* One underline, shared by every tab, so it slides to the chosen one. */}
          {tab.id === value && <m.span layoutId={indicator} className="tab-indicator" aria-hidden="true" />}
        </button>
      ))}
    </m.div>
  );
}

/** The content a tab shows, labelled by that tab. */
export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div key={id} role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}

/** A two-or-three way choice, such as "pickup / delivery". `label` names the group for screen readers. */
export function Segmented<T extends string>({ options, value, onChange, testIdPrefix, label, labelledBy }: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  testIdPrefix?: string;
  label?: string;
  labelledBy?: string;
}) {
  const thumb = useId();
  return (
    <m.div layoutScroll className="segmented" role="group" aria-label={label} aria-labelledby={labelledBy}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          data-testid={testIdPrefix ? `${testIdPrefix}-${option.id}` : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.id === value && <m.span layoutId={thumb} className="segmented-thumb" aria-hidden="true" />}
          <span className="segmented-label">{option.label}</span>
        </button>
      ))}
    </m.div>
  );
}

/** A small bar chart of values over time, e.g. what a lot is worth month by month. */
export function Timeline({ points, format }: {
  points: ReadonlyArray<{ label: string; value: number }>;
  format: (value: number) => string;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div>
      <div className="timeline">
        {points.map((point) => (
          <div
            key={point.label}
            className="timeline-bar"
            title={`${point.label}: ${format(point.value)}`}
            style={{ height: `${Math.max(3, (point.value / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="spread muted" style={{ marginTop: 6 }}>
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/**
 * Each crop's seal colour, taken from the crop itself, so lists can be scanned by crop
 * at a glance. All are deep enough for the white initial to read.
 */
const CROP_COLOURS: Record<string, string> = {
  cocoa: "oklch(0.42 0.08 45)",
  rice: "oklch(0.56 0.085 85)",
  maize: "oklch(0.6 0.13 75)",
  cashew: "oklch(0.55 0.15 40)",
  yam: "oklch(0.47 0.07 340)",
  soybeans: "oklch(0.52 0.1 135)",
};

export function CropSeal({ name, size = 34 }: { name: string | undefined; size?: number }) {
  const key = (name ?? "").toLowerCase();
  return (
    <span
      className="crop-seal"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.48, background: CROP_COLOURS[key] ?? "oklch(0.45 0.05 158)" }}
    >
      {(name ?? "?").charAt(0)}
    </span>
  );
}
