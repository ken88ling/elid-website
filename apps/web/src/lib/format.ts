const currency = process.env.NEXT_PUBLIC_CURRENCY || "USD";

const moneyFormat = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency,
});

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** All money is stored as integer cents. */
export function formatMoney(cents: number): string {
  return moneyFormat.format(cents / 100);
}

/** Parse user input like "12.5" or "$12.50" into cents. Returns null when empty or invalid. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** yyyy-mm-dd in local time, for <input type="date"> */
export function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Start of a local day (from a yyyy-mm-dd string) as an ISO timestamp. */
export function startOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00`).toISOString();
}

/** End of a local day (from a yyyy-mm-dd string) as an ISO timestamp. */
export function endOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999`).toISOString();
}
