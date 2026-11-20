export function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const DATE_UTC: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
};

const DATETIME_UTC: Intl.DateTimeFormatOptions = {
  ...DATE_UTC,
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
};

function formatDateParts(year: number, month: number, day: number): string {
  return `${MONTH_SHORT[month - 1]} ${day}, ${year}`;
}

/** Stable date formatting for SSR and client (UTC, en-US). */
export function formatDate(date: string) {
  if (!date) return "—";

  const dateOnly = DATE_ONLY.exec(date.trim());
  if (dateOnly) {
    return formatDateParts(
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
    );
  }

  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) return date;
  return new Date(parsed).toLocaleDateString("en-US", DATE_UTC);
}

/** Stable date/time formatting for SSR and client (UTC, en-US). */
export function formatDateTime(date: string) {
  if (!date) return "—";

  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) return date;
  return new Date(parsed).toLocaleString("en-US", DATETIME_UTC);
}
