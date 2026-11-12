export type Currency = "USD" | "EUR" | "GBP" | "CAD" | "AUD";

const money = new Map<string, Intl.NumberFormat>();
export function fmt(cents: number, currency: Currency | string = "USD") {
  let f = money.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "currency", currency });
    money.set(currency, f);
  }
  return f.format(cents / 100);
}
/** Splits "$161.29" into ["$161", ".29"] so cents can be set smaller. */
export function fmtParts(cents: number, currency: Currency | string = "USD") {
  const s = fmt(cents, currency);
  const i = s.lastIndexOf(".");
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i)];
}
export const num = (n: number, digits = 2) =>
  Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
export const fixed = (n: number, digits = 1) => n.toFixed(digits);
export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
export const compact = (n: number) =>
  Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export function periodLabel(period: string, style: "long" | "month" = "long") {
  const d = new Date(period + "-01T12:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "long",
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  });
}
export function lastDayOf(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
export const short = (h: string, n = 10) => (h.length > n * 2 ? `${h.slice(0, n)}…${h.slice(-4)}` : h);
export const pkgName = (id: string) => id.replace(/^[a-z]+:/, "");
export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" });
}
