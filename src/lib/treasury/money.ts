// Money helpers. Everything in the ledger is signed cents stored as
// Postgres `integer`. We never round to fractions of a cent in user-
// visible code; rounding-related drift is a class of bug we don't
// want.

export const SCOUT_ACCOUNTS = "scout-accounts";
export const GENERAL_FUND = "general";
export const STRIPE_FEES_FUND = "stripe-fees";

export const SYSTEM_FUND_CODES = [SCOUT_ACCOUNTS, GENERAL_FUND, STRIPE_FEES_FUND] as const;

export function dollarsToCents(d: number | string): number {
  if (typeof d === "string") d = parseFloat(d.replace(/[$,]/g, ""));
  if (!Number.isFinite(d)) return 0;
  return Math.round(d * 100);
}

export function centsToDollars(c: number): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}$${dollars.toLocaleString()}.${cents.toString().padStart(2, "0")}`;
}

/** Treasury balance display: positive = unit owes the family. */
export function formatBalance(cents: number): string {
  if (cents === 0) return centsToDollars(0);
  if (cents > 0) return `+${centsToDollars(cents)}`;
  return centsToDollars(cents);
}

export type TxType =
  | "dues"
  | "event-charge"
  | "deposit"
  | "expense"
  | "transfer-out"
  | "transfer-in"
  | "refund"
  | "fundraiser-credit"
  | "sale"
  | "manual";

export const TX_TYPE_LABELS: Record<TxType, string> = {
  dues: "Dues",
  "event-charge": "Event charge",
  deposit: "Deposit",
  expense: "Expense",
  "transfer-out": "Transfer out",
  "transfer-in": "Transfer in",
  refund: "Refund",
  "fundraiser-credit": "Fundraiser credit",
  sale: "Sale",
  manual: "Manual",
};
