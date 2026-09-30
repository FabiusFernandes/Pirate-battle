import type { MatchResult } from '@/game/engine/GameSession';
import type { EndReason } from '@/game/sim/types';

/** 125 → "02:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Spoken form for screen readers: 125 → "2 minutes 5 seconds". */
export function formatDurationLong(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  const parts: string[] = [];
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (seconds > 0 || minutes === 0) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export const END_REASON_LABEL: Record<EndReason, string> = {
  time_up: 'Time up',
  destroyed: 'Ship destroyed',
};

export function resultTitle(result: MatchResult): string {
  return result.reason === 'destroyed' ? 'Ship sunk' : 'Battle complete';
}
