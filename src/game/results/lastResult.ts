import type { MatchResult } from '@/game/engine/GameSession';
import { Store } from '@/lib/store';
import { readJson, writeJson } from '@/lib/storage';

const STORAGE_KEY = 'pirate-battle:last-result';

function isMatchResult(value: unknown): value is MatchResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.matchId === 'string' &&
    typeof v.seed === 'number' &&
    typeof v.score === 'number' &&
    typeof v.duration === 'number' &&
    (v.reason === 'time_up' || v.reason === 'destroyed') &&
    typeof v.sessionTime === 'number' &&
    typeof v.spawnInterval === 'number' &&
    typeof v.endedAt === 'string'
  );
}

function load(): MatchResult | null {
  const stored = readJson(STORAGE_KEY);
  return isMatchResult(stored) ? stored : null;
}

/** The last completed match (abandoned matches never get here), persisted across refreshes. */
export const lastResult = new Store<MatchResult | null>(load());

export function saveLastResult(result: MatchResult): void {
  lastResult.set(result);
  writeJson(STORAGE_KEY, result);
}
