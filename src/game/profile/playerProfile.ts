import { Store, shallowEqual } from '@/lib/store';
import { readJson, writeJson } from '@/lib/storage';

const STORAGE_KEY = 'pirate-battle:profile';
export const NAME_LIMITS = { min: 2, max: 20 } as const;
export const DEFAULT_CAPTAIN_NAME = 'Captain Jack';

export interface PlayerProfile {
  /** Stable anonymous id of this browser's player; used by history and ranking. */
  id: string;
  name: string;
}

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '._-]*$/u;

export function validateCaptainName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < NAME_LIMITS.min) return `Use at least ${NAME_LIMITS.min} characters.`;
  if (name.length > NAME_LIMITS.max) return `Use at most ${NAME_LIMITS.max} characters.`;
  if (!NAME_PATTERN.test(name)) return 'Use letters, numbers, spaces and . _ - \' only.';
  return null;
}

function load(): PlayerProfile {
  const stored = readJson(STORAGE_KEY);
  if (typeof stored === 'object' && stored !== null) {
    const { id, name } = stored as Record<string, unknown>;
    if (typeof id === 'string' && id.length > 0 && typeof name === 'string' && validateCaptainName(name) === null) {
      return { id, name };
    }
  }
  const profile = { id: crypto.randomUUID(), name: DEFAULT_CAPTAIN_NAME };
  writeJson(STORAGE_KEY, profile);
  return profile;
}

export const playerProfile = new Store<PlayerProfile>(load(), shallowEqual);

export function saveCaptainName(name: string): boolean {
  const next = { ...playerProfile.getSnapshot(), name: name.trim() };
  playerProfile.set(next);
  return writeJson(STORAGE_KEY, next);
}
