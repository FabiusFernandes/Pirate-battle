const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const FULL = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short' });

/** "08 SEP · 21:42" (visual) — local time. */
export function formatPlayed(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, '0');
  return `${day} ${MONTHS[date.getMonth()] ?? ''} · ${TIME.format(date)}`;
}

/** "8 September 2026 at 21:42" (for screen readers / tooltips). */
export function formatPlayedLong(iso: string): string {
  return FULL.format(new Date(iso));
}

export function formatRank(rank: number): string {
  return String(rank).padStart(2, '0');
}
