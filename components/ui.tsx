import type { ReactNode } from "react";

/** Page title and one plain-language line on what the page is for. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header spread" style={{ alignItems: "flex-start" }}>
      <div>
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
        <div className="spread" style={{ marginBottom: 14 }}>
          {title && <h2 style={{ marginBottom: 0 }}>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, testId }: { label: string; value: ReactNode; sub?: ReactNode; testId?: string }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" data-testid={testId}>
        {value}
      </div>
      {sub && <div className="stat-sub" style={{ marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

type Tone = "green" | "gold" | "red" | "blue" | "muted";

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
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

export function Notice({ tone = "info", children, testId }: {
  tone?: "info" | "warn" | "danger" | "ok";
  children: ReactNode;
  testId?: string;
}) {
  const cls = tone === "info" ? "notice" : `notice notice-${tone}`;
  return (
    <div className={cls} data-testid={testId}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, padding: "8px 0" }}>{children}</p>;
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
            style={{ height: `${Math.max(2, (point.value / max) * 100)}%` }}
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
