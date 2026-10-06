import { useEffect, useState } from "react";
import { formatUnits, hexToString, parseUnits, toHex } from "viem";

import { KG_DECIMALS, PRICE_DECIMALS, USDC_DECIMALS, WAD } from "./contracts/config";

/*//////////////////////////////////////////////////////////////
                        MONEY AND WEIGHT
//////////////////////////////////////////////////////////////*/
// The app shows dollars and kilograms; tokens, decimals and wei stay out of sight.

/** "$1,234.56" (or "-$12.00") from a 6-decimal USDC amount. */
export function usd(value: bigint | undefined, fractionDigits = 2): string {
  if (value === undefined) return "—";
  const amount = Number(formatUnits(value, USDC_DECIMALS));
  const text = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  // Amounts that round to zero read "$0.00", never "-$0.00".
  return amount < 0 && Number(text.replace(/,/g, "")) !== 0 ? `-$${text}` : `$${text}`;
}

/** "1,000 kg", or "12.5 t" from 10 tonnes up, from an 18-decimal quantity. */
export function kg(value: bigint | undefined): string {
  if (value === undefined) return "—";
  const amount = Number(formatUnits(value, KG_DECIMALS));
  if (amount >= 10_000) {
    return `${(amount / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} t`;
  }
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} kg`;
}

/** Plain number of kilograms, for form defaults. */
export function kgNumber(value: bigint | undefined): number {
  return value === undefined ? 0 : Number(formatUnits(value, KG_DECIMALS));
}

/** "$5.85/kg" from an 8-decimal oracle price. */
export function pricePerKg(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return `$${Number(formatUnits(value, PRICE_DECIMALS)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}/kg`;
}

/** "$5.85/kg" from a 6-decimal USDC-per-kilogram amount (marketplace prices). */
export function usdPerKg(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return `${usd(value, value < 10_000n ? 4 : 2)}/kg`;
}

/** "50%" from basis points. */
export function percentFromBps(bps: bigint | number | undefined, fractionDigits = 0): string {
  if (bps === undefined) return "—";
  return `${(Number(bps) / 100).toFixed(fractionDigits)}%`;
}

/** "13.0%" from a 1e18-scaled annual rate. */
export function percentFromWad(value: bigint | undefined, fractionDigits = 1): string {
  if (value === undefined) return "—";
  return `${((Number(value) / Number(WAD)) * 100).toFixed(fractionDigits)}%`;
}

/*//////////////////////////////////////////////////////////////
                              INPUT
//////////////////////////////////////////////////////////////*/

/** Parses a dollar amount typed by the user; undefined when it is not a positive number. */
export function parseUsd(input: string): bigint | undefined {
  return parsePositive(input, USDC_DECIMALS);
}

/** Parses kilograms typed by the user; undefined when it is not a positive number. */
export function parseKg(input: string): bigint | undefined {
  return parsePositive(input, KG_DECIMALS);
}

function parsePositive(input: string, decimals: number): bigint | undefined {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  try {
    const value = parseUnits(trimmed, decimals);
    return value > 0n ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Percentage typed by the user ("10" or "12.5") as basis points; undefined when out of range. */
export function parsePercentToBps(input: string, max = 100): number | undefined {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0 || value > max) return undefined;
  return Math.round(value * 100);
}

/*//////////////////////////////////////////////////////////////
                              TIME
//////////////////////////////////////////////////////////////*/

const DAY = 86_400;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** The time in unix seconds, as state that ticks every minute, so renders stay pure. */
export function useNow(): number {
  const [now, setNow] = useState(() => nowSeconds());
  useEffect(() => {
    const timer = setInterval(() => setNow(nowSeconds()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** "12 Mar 2027" from unix seconds. */
export function date(seconds: bigint | number | undefined): string {
  if (seconds === undefined || Number(seconds) === 0) return "—";
  return new Date(Number(seconds) * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Whole days from now until `seconds` (negative once it has passed). */
export function daysUntil(seconds: bigint | number): number {
  return Math.floor((Number(seconds) - nowSeconds()) / DAY);
}

/** "in 12 days", "today", "3 days ago". */
export function relativeDays(seconds: bigint | number | undefined): string {
  if (seconds === undefined || Number(seconds) === 0) return "—";
  const days = daysUntil(seconds);
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `${-days} day${days === -1 ? "" : "s"} ago`;
}

/** yyyy-mm-dd for date inputs. */
export function isoDay(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/** Unix seconds at `time` UTC of a yyyy-mm-dd date input. */
function secondsFromIsoDay(day: string, time: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const ms = Date.parse(`${day}T${time}Z`);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

/**
 * Harvest date for the registry, which refuses dates in the future: the start of
 * that day, and never later than a minute ago (so "today" works in every time zone).
 */
export function harvestTimestamp(day: string): number | undefined {
  const start = secondsFromIsoDay(day, "00:00:00");
  return start === undefined ? undefined : Math.min(start, nowSeconds() - 60);
}

/** A loan's end date: noon UTC of the chosen day. */
export function maturityTimestamp(day: string): number | undefined {
  return secondsFromIsoDay(day, "12:00:00");
}

export const SECONDS_PER_DAY = DAY;

/*//////////////////////////////////////////////////////////////
                             OTHER
//////////////////////////////////////////////////////////////*/

/** "0x1234…abcd" */
export function shortAddress(value: string | undefined): string {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** A short reason stored on-chain as bytes32 (e.g. why a delivery was rejected), as text. */
export function bytes32ToText(value: `0x${string}` | undefined): string {
  if (!value || /^0x0*$/.test(value)) return "";
  try {
    return hexToString(value, { size: 32 }).replace(/\0+$/, "");
  } catch {
    return "";
  }
}

/** Text for a bytes32 field, cut to fit its 32 bytes. */
export function textToBytes32(text: string): `0x${string}` {
  const bytes = new TextEncoder().encode(text.trim()).slice(0, 32);
  return toHex(bytes, { size: 32 });
}
