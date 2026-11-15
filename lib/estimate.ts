import type { RentalCase } from "@/types/case";

// An estimate needs findings: the example case's fixture, or charges the
// automated audit reviewed. Charges only recorded by the renter have neither.
export function estimateRecovery(data: RentalCase) {
  const reviewed = data.demo || data.charges.some((c) => c.requests !== undefined);
  if (!reviewed || !data.audited || data.stale) return null;
  if (
    !Number.isFinite(data.deposit) ||
    !Number.isFinite(data.returned) ||
    data.deposit < data.returned ||
    data.returned < 0
  )
    return null;
  const included = data.charges.filter(
    (c) =>
      (c.verdict === "disputable" || c.verdict === "not-allowed") &&
      c.sources.length > 0 &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.high) &&
      c.low >= 0 &&
      c.high >= c.low &&
      c.high <= c.amount,
  );
  if (!included.length) return null;
  const cap = Math.max(0, data.deposit - data.returned);
  return {
    low: Math.min(
      cap,
      included.reduce((n, c) => n + c.low, 0),
    ),
    high: Math.min(
      cap,
      included.reduce((n, c) => n + c.high, 0),
    ),
    included,
  };
}
export function daysUntil(
  date: string,
  today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()),
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    return null;
  return Math.ceil((Date.parse(date) - Date.parse(today)) / 86400000);
}
