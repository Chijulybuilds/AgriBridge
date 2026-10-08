import { useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  BuildingLibraryIcon,
  ChartBarIcon,
  CheckBadgeIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  ShoppingBagIcon,
  TagIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";

import AppLayout from "../components/layout/AppLayout";
import { Card, EmptyState, PageHeader, Segmented, Skeleton } from "../components/ui";
import { useActivity, type ActivityItem } from "../hooks/useActivity";
import { activeChain } from "../lib/wagmi";
import { useRememberedRole } from "../lib/session";

type Topic = "all" | "crop" | "money" | "market" | "prices";
type Icon = typeof TruckIcon;

/** How each kind of event looks in the feed, and which filter it falls under. */
const EVENTS: Record<string, { icon: Icon; tone: "green" | "gold" | "red" | "blue"; topic: Exclude<Topic, "all"> }> = {
  IntakeRequested: { icon: TruckIcon, tone: "green", topic: "crop" },
  IntakeApproved: { icon: CheckBadgeIcon, tone: "green", topic: "crop" },
  IntakeRejected: { icon: ExclamationTriangleIcon, tone: "red", topic: "crop" },
  IntakeCancelled: { icon: TruckIcon, tone: "red", topic: "crop" },
  LotFrozen: { icon: LockClosedIcon, tone: "red", topic: "crop" },
  WarehouseFrozen: { icon: LockClosedIcon, tone: "red", topic: "crop" },
  StockReleased: { icon: TruckIcon, tone: "blue", topic: "crop" },
  WithdrawalRequested: { icon: TruckIcon, tone: "blue", topic: "crop" },
  WithdrawalReleased: { icon: TruckIcon, tone: "blue", topic: "crop" },
  LiquidityDeposited: { icon: BuildingLibraryIcon, tone: "blue", topic: "money" },
  LiquidityWithdrawn: { icon: BuildingLibraryIcon, tone: "blue", topic: "money" },
  LoanOpened: { icon: BanknotesIcon, tone: "gold", topic: "money" },
  LoanRepaid: { icon: BanknotesIcon, tone: "green", topic: "money" },
  LoanLiquidated: { icon: ExclamationTriangleIcon, tone: "red", topic: "money" },
  Transfer: { icon: CurrencyDollarIcon, tone: "gold", topic: "money" },
  Listed: { icon: TagIcon, tone: "gold", topic: "market" },
  Bought: { icon: ShoppingBagIcon, tone: "green", topic: "market" },
  ExpiredStockSold: { icon: TagIcon, tone: "red", topic: "market" },
  PriceUpdated: { icon: ChartBarIcon, tone: "blue", topic: "prices" },
};

const FALLBACK = { icon: ClockIcon, tone: "blue" as const, topic: "crop" as const };

/**
 * Everything that happened on AgriBridge, newest first, each line linked to the
 * transaction that did it, so anyone can check the record on the blockchain.
 */
export default function Activity() {
  const role = useRememberedRole("farmer");
  const { data, isLoading, error } = useActivity();
  const explorer = activeChain.blockExplorers?.default.url;
  const [topic, setTopic] = useState<Topic>("all");

  const items = (data ?? []).filter((item) => topic === "all" || (EVENTS[item.event] ?? FALLBACK).topic === topic);

  return (
    <AppLayout role={role} title="Activity" requireWallet={false}>
      <PageHeader eyebrow="Public record" title="Activity" subtitle="Every delivery, advance, sale and price change, read straight from the blockchain." />
      <Card
        testId="activity"
        actions={
          <Segmented
            options={[
              { id: "all", label: "All" },
              { id: "crop", label: "Crop" },
              { id: "money", label: "Money" },
              { id: "market", label: "Market" },
              { id: "prices", label: "Prices" },
            ]}
            value={topic}
            onChange={setTopic}
            testIdPrefix="topic"
            label="Show"
          />
        }
      >
        {isLoading ? (
          <Skeleton rows={6} height={22} />
        ) : error ? (
          <EmptyState icon={ExclamationTriangleIcon} title="Couldn't read the activity">
            {(error as Error).message}
          </EmptyState>
        ) : items.length === 0 ? (
          <EmptyState icon={ClockIcon}>{topic === "all" ? "Nothing has happened yet." : "Nothing of this kind yet."}</EmptyState>
        ) : (
          <Feed items={items} explorer={explorer} />
        )}
      </Card>
    </AppLayout>
  );
}

/** The feed, grouped by day: an icon for the kind of event, the sentence, the time and a link to the transaction. */
function Feed({ items, explorer }: { items: ActivityItem[]; explorer?: string }) {
  const days: Array<{ day: string; items: ActivityItem[] }> = [];
  for (const item of items) {
    const day = item.timestamp ? new Date(item.timestamp * 1000).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date unknown";
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(item);
  }

  return (
    <div className="feed">
      {days.map(({ day, items: dayItems }) => (
        <section key={day}>
          <h3 className="feed-day">{day}</h3>
          <ol className="feed-list">
            {dayItems.map((item) => {
              const look = EVENTS[item.event] ?? FALLBACK;
              const IconComponent = look.icon;
              return (
                <li key={item.key} className="feed-item">
                  <span className={`stat-icon tone-${look.tone}`}>
                    <IconComponent />
                  </span>
                  <div className="feed-body">
                    <div>{item.text}</div>
                    <span className="muted">
                      {item.timestamp ? new Date(item.timestamp * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                  </div>
                  {explorer ? (
                    <a className="feed-link" href={`${explorer}/tx/${item.txHash}`} target="_blank" rel="noreferrer">
                      View <ArrowTopRightOnSquareIcon />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
