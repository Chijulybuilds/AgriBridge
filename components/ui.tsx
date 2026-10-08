import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

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

export function Stat({
  label,
  value,
  sub,
  icon: IconComponent,
  tone = "green",
  testId,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: Icon;
  tone?: Exclude<Tone, "muted">;
  testId?: string;
}) {
  return (
    <div className="card stat">
      <div className="stat-head">
        {IconComponent && (
          <span className={`stat-icon tone-${tone}`}>
            <IconComponent />
          </span>
        )}
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value" data-testid={testId}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
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

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className="tab"
          role="tab"
          aria-selected={tab.id === value}
          data-testid={`tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** A two-or-three way choice, such as "pickup / delivery". */
export function Segmented<T extends string>({ options, value, onChange, testIdPrefix }: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  testIdPrefix?: string;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          data-testid={testIdPrefix ? `${testIdPrefix}-${option.id}` : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
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

/** Each crop's seal colour, so lists can be scanned by crop at a glance. */
const CROP_COLOURS: Record<string, string> = {
  cocoa: "#7a4a2a",
  rice: "#b79a4c",
  maize: "#d59b17",
  cashew: "#c8692c",
  yam: "#8a5a7a",
  soybeans: "#5f8a3a",
};

export function CropSeal({ name, size = 34 }: { name: string | undefined; size?: number }) {
  const key = (name ?? "").toLowerCase();
  return (
    <span
      className="crop-seal"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.44, background: CROP_COLOURS[key] ?? "#4f6b57" }}
    >
      {(name ?? "?").charAt(0)}
    </span>
  );
}
