import { createHash, randomUUID } from "node:crypto";
import type { Currency, State } from "./model";
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
      .join(",") +
    "}"
  );
}
export const hash = (v: unknown) =>
  createHash("sha256").update(canonical(v)).digest("hex");
export const id = (prefix: string) => prefix + "_" + randomUUID();
export const now = () => new Date().toISOString();
/**
 * Payout-eligibility cooldown in days. 14 by default. A shortened value is honoured
 * ONLY when NEBRASKA_MODE=sandbox and DEMO_COOLDOWN_MINUTES is a positive number;
 * in demo or any other mode the variable is ignored.
 */
export function cooldownDays(): number {
  return demoOverrides().cooldownMinutes !== undefined
    ? demoOverrides().cooldownMinutes! / 1440
    : 14;
}
export function demoOverrides(): { cooldownMinutes?: number } {
  const raw = process.env.DEMO_COOLDOWN_MINUTES;
  if (process.env.NEBRASKA_MODE !== "sandbox" || !raw) return {};
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes > 0 && minutes < 14 * 1440
    ? { cooldownMinutes: minutes }
    : {};
}
export const periodOf = (at = now()) => at.slice(0, 7);
export function addMonths(period: string, n: number) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
export const daysSince = (date: string, at = now()) =>
  (Date.parse(at) - Date.parse(date)) / 86_400_000;
export const money = (cents: number, currency: Currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
export function requireRow<T>(
  row: T | undefined,
  message = "Record not found",
): T {
  if (!row) throw new DomainError(message, 404);
  return row;
}
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "INVALID_REQUEST",
  ) {
    super(message);
  }
}
export function requireInt(n: number) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new DomainError("Money must be nonnegative integer minor units");
  return n;
}
export function activeHold(s: State, maintainerId: string) {
  return s.holds.find((h) => h.maintainerId === maintainerId && !h.releasedAt);
}
export function splitCents(
  total: number,
  shares: { id: string; weight: number }[],
): { id: string; cents: number }[] {
  requireInt(total);
  const sorted = [...shares].sort((a, b) => a.id.localeCompare(b.id));
  const sum = sorted.reduce((n, x) => n + x.weight, 0);
  if (!sum) return [];
  const rows = sorted.map((x) => ({
    id: x.id,
    cents: Math.floor((total * x.weight) / sum),
    fraction: ((total * x.weight) / sum) % 1,
  }));
  const remaining = total - rows.reduce((n, x) => n + x.cents, 0);
  const rank = [...rows].sort(
    (a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id),
  );
  for (let i = 0; i < remaining; i++) rank[i % rank.length].cents++;
  return rows.map(({ id, cents }) => ({ id, cents }));
}
