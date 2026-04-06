import { format } from 'date-fns';

type DateInput = string | number | Date;

function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input);
}

/** "MMM d, yyyy - h:mm a" — e.g. "Jan 5, 2026 - 3:30 PM" */
export function formatMatchCardDate(input: DateInput): string {
  return format(toDate(input), 'MMM d, yyyy - h:mm a');
}

/** "MMMM d, yyyy" — e.g. "January 5, 2026" */
export function formatFullDate(input: DateInput): string {
  return format(toDate(input), 'MMMM d, yyyy');
}

/** "h:mm a" — e.g. "3:30 PM" */
export function formatTime(input: DateInput): string {
  return format(toDate(input), 'h:mm a');
}

/** "MMM d" — e.g. "Jan 5" */
export function formatShortDate(input: DateInput): string {
  return format(toDate(input), 'MMM d');
}

/** "MMM d, yyyy" — e.g. "Jan 5, 2026" */
export function formatMediumDate(input: DateInput): string {
  return format(toDate(input), 'MMM d, yyyy');
}

/** "MMM d, yyyy · h:mm a" — e.g. "Jan 5, 2026 · 3:30 PM" */
export function formatDateWithTime(input: DateInput): string {
  return format(toDate(input), "MMM d, yyyy '·' h:mm a");
}

/** "EEE, MMM d" — e.g. "Sun, Jan 5" */
export function formatWeekdayShortDate(input: DateInput): string {
  return format(toDate(input), 'EEE, MMM d');
}

/** "Today" / "Tomorrow" / "EEE, MMM d" */
export function formatSmartDate(input: DateInput): string {
  const d = toDate(input);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return formatWeekdayShortDate(d);
}

/** "EEEE, MMMM d, yyyy" — e.g. "Saturday, January 5, 2026" */
export function formatAccessibleDate(input: DateInput): string {
  return format(toDate(input), 'EEEE, MMMM d, yyyy');
}

/** "Just now" / "5m ago" / "3h ago" / "2d ago" / "Jan 5" */
export function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatShortDate(timestamp);
}
