import { useEffect, useState } from "react";
import { formatUnits, hexToString, parseUnits, toHex } from "viem";

import { KG_DECIMALS, PRICE_DECIMALS, USDC_DECIMALS, WAD } from "./contracts/config";

/*//////////////////////////////////////////////////////////////
                        MONEY AND WEIGHT
//////////////////////////////////////////////////////////////*/
// The app shows naira first, with the dollars it settles in (USDC) beside them, and kilograms;
// tokens, decimals and wei stay out of sight.

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

/**
 * Kilograms as a form shows them: at most two decimals, rounded down so it never
 * offers more than there is ("5.88", not "5.882350588235294").
 */
export function kgInput(value: bigint): string {
  const step = 10n ** BigInt(KG_DECIMALS - 2);
  return formatUnits((value / step) * step, KG_DECIMALS);
}

/**
 * Kilograms typed into a form that offers up to `all`. Leaving the offered
 * amount as it is means all of it, exactly, so no crumb is left behind.
 */
export function parseKgUpTo(input: string, all: bigint): bigint | undefined {
  return input.trim() === kgInput(all) ? all : parseKg(input);
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

/** "0.0084 ETH": Sepolia's own coin, which pays every network fee, to 4 decimals (8 when tiny). */
export function eth(value: bigint | undefined): string {
  if (value === undefined) return "—";
  const amount = Number(formatUnits(value, 18));
  const digits = amount > 0 && amount < 0.0001 ? 8 : 4;
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: digits })} ETH`;
}

/*//////////////////////////////////////////////////////////////
                              INPUT
//////////////////////////////////////////////////////////////*/

/** Parses a dollar amount typed by the user; undefined when it is not a positive number. */
export function parseUsd(input: string): bigint | undefined {
  return parsePositive(input, USDC_DECIMALS);
}

/** Naira typed by the user ("1,500,000", "₦4,800" or "4800.50"), in kobo; undefined unless positive. */
function parseKobo(input: string): bigint | undefined {
  return parsePositive(input.replace(/[₦,\s]/g, ""), 2);
}

/**
 * Naira typed by the user, as USDC (6 decimals) at the demo rate, rounded down: amounts, and
 * marketplace prices per kilogram. Undefined unless it is a positive amount.
 */
export function parseNaira(input: string): bigint | undefined {
  const kobo = parseKobo(input);
  if (kobo === undefined) return undefined;
  // kobo x 1e6 / (100 x rate)
  const value = (kobo * 10_000n) / NAIRA_RATE;
  return value > 0n ? value : undefined;
}

/** Naira per kilogram typed by the user, as an 8-decimal oracle price at the demo rate, rounded down. */
export function parseNairaPrice(input: string): bigint | undefined {
  const kobo = parseKobo(input);
  if (kobo === undefined) return undefined;
  // kobo x 1e8 / (100 x rate)
  const value = (kobo * 1_000_000n) / NAIRA_RATE;
  return value > 0n ? value : undefined;
}

/** USDC (6 decimals) as whole naira for a form, rounded down, so "Max" never asks for more than allowed. */
export function nairaInput(value: bigint): string {
  return ((value * NAIRA_RATE) / 1_000_000n).toString();
}

/**
 * Naira typed into a form that offers up to `all`. Leaving the offered amount as it is means all of
 * it, exactly, so withdrawing everything leaves nothing behind.
 */
export function parseNairaUpTo(input: string, all: bigint | undefined): bigint | undefined {
  return all !== undefined && all > 0n && input.trim() === nairaInput(all) ? all : parseNaira(input);
}

/** Parses kilograms typed by the user; undefined when it is not a positive number. */
export function parseKg(input: string): bigint | undefined {
  return parsePositive(input, KG_DECIMALS);
}

/** ETH typed by the user, in wei; undefined when it is not a positive number. */
export function parseEth(input: string): bigint | undefined {
  return parsePositive(input.replace(/[,\s]/g, ""), 18);
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

/**
 * Naira first. People using AgriBridge think in naira, so every amount leads with naira and shows the
 * dollars it settles in (USDC) beside it, smaller. The rate is a fixed demo rate, labelled as such
 * where it appears, not a live exchange rate.
 */
export const NAIRA_PER_DOLLAR = 1_500;
const NAIRA_RATE = BigInt(NAIRA_PER_DOLLAR);

/** "₦1,500,000", or "-₦12.50": whole naira, with kobo only below ₦100. */
function nairaText(amount: number): string {
  const digits = amount !== 0 && Math.abs(amount) < 100 ? 2 : 0;
  const text = Math.abs(amount).toLocaleString("en-NG", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return amount < 0 && Number(text.replace(/,/g, "")) !== 0 ? `-₦${text}` : `₦${text}`;
}

/** "₦1,500,000" from USDC (6 decimals). */
export function ngn(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return nairaText((Number(value) / 1e6) * NAIRA_PER_DOLLAR);
}

/** "₦1,500,000 ($1,000.00)": naira first, then the dollars, for sentences, hints and messages. */
export function money(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return `${ngn(value)} (${usd(value)})`;
}

/** "₦4,800/kg" from a 6-decimal USDC-per-kilogram amount (marketplace prices). */
export function ngnPerKg(value: bigint | undefined): string {
  return value === undefined ? "—" : `${ngn(value)}/kg`;
}

/** "₦4,800/kg ($3.20/kg)" from a 6-decimal USDC-per-kilogram amount. */
export function moneyPerKg(value: bigint | undefined): string {
  return value === undefined ? "—" : `${ngnPerKg(value)} (${usdPerKg(value)})`;
}

/** "₦8,775/kg" from an 8-decimal oracle price. */
export function priceNgnPerKg(value: bigint | undefined): string {
  return value === undefined ? "—" : `${nairaText((Number(value) / 1e8) * NAIRA_PER_DOLLAR)}/kg`;
}

/** "₦8,775/kg ($5.85/kg)" from an 8-decimal oracle price. */
export function priceMoneyPerKg(value: bigint | undefined): string {
  return value === undefined ? "—" : `${priceNgnPerKg(value)} (${pricePerKg(value)})`;
}

/** "₦7,458,000" from a dollar figure held as a plain number (counting figures and charts). */
export function ngnFromDollars(dollars: number): string {
  return nairaText(dollars * NAIRA_PER_DOLLAR);
}

/** "12 Mar, 14:02" from unix seconds, in the viewer's time zone. */
export function dateTime(seconds: bigint | number | undefined): string {
  if (seconds === undefined || Number(seconds) === 0) return "—";
  return new Date(Number(seconds) * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
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

/** A whole address in groups of four, easy to read out and check: "0x7099 7970 C518 12dc …". */
export function addressGroups(value: string | undefined): string {
  if (!value) return "—";
  return `0x${(value.slice(2).match(/.{1,4}/g) ?? []).join(" ")}`;
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
