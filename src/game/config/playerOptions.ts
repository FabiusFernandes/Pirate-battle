import { Store, shallowEqual } from '@/lib/store';
import { readJson, writeJson } from '@/lib/storage';
import { DEFAULT_PLAYER_OPTIONS, SESSION_TIME_LIMITS, SPAWN_INTERVAL_LIMITS, type PlayerOptions } from './gameConfig';

const STORAGE_KEY = 'pirate-battle:options';

export type OptionField = keyof PlayerOptions;
export type OptionErrors = Partial<Record<OptionField, string>>;

/** Raw form input: numbers as typed (strings) so partial input can be validated too. */
export type OptionsDraft = Record<OptionField, string>;

function isOnStep(value: number, min: number, step: number): boolean {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

function validateNumber(raw: string, limits: { min: number; max: number; step: number }, unit: string): string | null {
  const text = raw.trim();
  if (text === '') return 'Enter a value.';
  const value = Number(text);
  if (!Number.isFinite(value)) return 'Enter a number.';
  if (value <= 0) return 'Must be greater than zero.';
  if (value < limits.min || value > limits.max) return `Must be between ${limits.min} and ${limits.max} ${unit}.`;
  if (!isOnStep(value, limits.min, limits.step)) return `Use steps of ${limits.step} ${unit}.`;
  return null;
}

/** Validates form input. Returns parsed options when valid, otherwise per-field messages. */
export function validateOptions(draft: OptionsDraft): { options: PlayerOptions; errors: null } | { options: null; errors: OptionErrors } {
  const errors: OptionErrors = {};
  const session = validateNumber(draft.sessionTime, SESSION_TIME_LIMITS, 'seconds');
  const spawn = validateNumber(draft.spawnInterval, SPAWN_INTERVAL_LIMITS, 'seconds');
  if (session) errors.sessionTime = session;
  if (spawn) errors.spawnInterval = spawn;
  if (session || spawn) return { options: null, errors };
  return { options: { sessionTime: Number(draft.sessionTime), spawnInterval: Number(draft.spawnInterval) }, errors: null };
}

export function toDraft(options: PlayerOptions): OptionsDraft {
  return { sessionTime: String(options.sessionTime), spawnInterval: String(options.spawnInterval) };
}

/** Reads persisted options; anything missing or invalid falls back to the defaults. */
function load(): PlayerOptions {
  const stored = readJson(STORAGE_KEY);
  if (typeof stored !== 'object' || stored === null) return DEFAULT_PLAYER_OPTIONS;
  const record = stored as Record<string, unknown>;
  const text = (v: unknown): string => (typeof v === 'number' ? String(v) : '');
  const result = validateOptions({ sessionTime: text(record.sessionTime), spawnInterval: text(record.spawnInterval) });
  return result.options ?? DEFAULT_PLAYER_OPTIONS;
}

/**
 * Player options, persisted in localStorage. Matches read a snapshot when they start, so
 * saving while a match is paused only affects the next match.
 */
export const playerOptions = new Store<PlayerOptions>(load(), shallowEqual);

export function savePlayerOptions(options: PlayerOptions): boolean {
  playerOptions.set({ ...options });
  return writeJson(STORAGE_KEY, options);
}
