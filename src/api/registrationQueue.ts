import type { MatchResult } from '@/game/engine/GameSession';
import type { PlayerProfile } from '@/game/profile/playerProfile';
import { Store } from '@/lib/store';
import { readJson, writeJson } from '@/lib/storage';
import type { MatchRecordInput } from './contracts';

/**
 * - `pending`    waiting to be sent (new, recovered after a refresh, or retry requested)
 * - `submitting` a request is in flight
 * - `failed`     every automatic attempt failed; kept for a manual or later retry
 * - `confirmed`  the server holds the record
 */
export type RegistrationStatus = 'pending' | 'submitting' | 'failed' | 'confirmed';

export interface RegistrationEntry {
  matchId: string;
  record: MatchRecordInput;
  status: RegistrationStatus;
  attempts: number;
  lastError: string | null;
  /** true when the server created it, false when it already had it (idempotent replay). */
  created: boolean | null;
  updatedAt: string;
}

type Entries = Readonly<Record<string, RegistrationEntry>>;

const STORAGE_KEY = 'pirate-battle:registrations';
/** Confirmed entries kept for status display; older ones are pruned. */
const KEEP_CONFIRMED = 30;

const STATUSES: readonly RegistrationStatus[] = ['pending', 'submitting', 'failed', 'confirmed'];

function isEntry(value: unknown): value is RegistrationEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.matchId === 'string' &&
    typeof v.record === 'object' &&
    v.record !== null &&
    STATUSES.includes(v.status as RegistrationStatus) &&
    typeof v.attempts === 'number'
  );
}

function load(): Entries {
  const stored = readJson(STORAGE_KEY);
  if (typeof stored !== 'object' || stored === null) return {};
  const out: Record<string, RegistrationEntry> = {};
  for (const value of Object.values(stored as Record<string, unknown>)) {
    if (!isEntry(value)) continue;
    // A request interrupted by a refresh is resent: the server deduplicates by matchId.
    out[value.matchId] = value.status === 'submitting' ? { ...value, status: 'pending' } : value;
  }
  return out;
}

function prune(entries: Entries): Entries {
  const confirmed = Object.values(entries)
    .filter((e) => e.status === 'confirmed')
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  if (confirmed.length <= KEEP_CONFIRMED) return entries;
  const drop = new Set(confirmed.slice(KEEP_CONFIRMED).map((e) => e.matchId));
  return Object.fromEntries(Object.entries(entries).filter(([id]) => !drop.has(id)));
}

export function toRecordInput(result: MatchResult, profile: PlayerProfile): MatchRecordInput {
  return {
    matchId: result.matchId,
    playerId: profile.id,
    playerName: profile.name,
    score: result.score,
    duration: result.duration,
    reason: result.reason,
    setup: { sessionTime: result.sessionTime, spawnInterval: result.spawnInterval },
    seed: result.seed,
    endedAt: result.endedAt,
  };
}

/**
 * Durable outbox of completed matches waiting to be registered. Every change is persisted to
 * localStorage, so pending registrations survive failures and refreshes. The queue itself
 * never sends anything: `RegistrationManager` drains it through a TanStack Query mutation.
 */
class RegistrationQueue {
  readonly store = new Store<Entries>(load());

  entry(matchId: string): RegistrationEntry | undefined {
    return this.store.getSnapshot()[matchId];
  }

  /** Adds a completed match. Adding the same match twice is a no-op (one match, one record). */
  enqueue(record: MatchRecordInput): void {
    if (this.entry(record.matchId)) return;
    this.write({
      matchId: record.matchId,
      record,
      status: 'pending',
      attempts: 0,
      lastError: null,
      created: null,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Next entry to send, oldest first. */
  nextPending(): RegistrationEntry | undefined {
    return Object.values(this.store.getSnapshot())
      .filter((e) => e.status === 'pending')
      .sort((a, b) => (a.record.endedAt < b.record.endedAt ? -1 : 1))[0];
  }

  unconfirmed(): RegistrationEntry[] {
    return Object.values(this.store.getSnapshot())
      .filter((e) => e.status !== 'confirmed')
      .sort((a, b) => (a.record.endedAt < b.record.endedAt ? 1 : -1));
  }

  markSubmitting(matchId: string): void {
    this.patch(matchId, (e) => ({ ...e, status: 'submitting', attempts: e.attempts + 1 }));
  }

  markConfirmed(matchId: string, created: boolean): void {
    this.patch(matchId, (e) => ({ ...e, status: 'confirmed', lastError: null, created }));
  }

  markFailed(matchId: string, message: string): void {
    this.patch(matchId, (e) => ({ ...e, status: 'failed', lastError: message }));
  }

  /** Manual retry. Only failed entries can be retried, so repeated clicks never double-send. */
  retry(matchId: string): void {
    this.patch(matchId, (e) => (e.status === 'failed' ? { ...e, status: 'pending' } : e));
  }

  /** Requeues every failed entry (app start, connection back). */
  retryAllFailed(): void {
    const entries = this.store.getSnapshot();
    if (!Object.values(entries).some((e) => e.status === 'failed')) return;
    const next: Record<string, RegistrationEntry> = {};
    for (const [id, e] of Object.entries(entries)) next[id] = e.status === 'failed' ? { ...e, status: 'pending' } : e;
    this.commit(next);
  }

  clear(): void {
    this.commit({});
  }

  private patch(matchId: string, fn: (entry: RegistrationEntry) => RegistrationEntry): void {
    const current = this.entry(matchId);
    if (!current) return;
    const next = fn(current);
    if (next === current) return;
    this.write({ ...next, updatedAt: new Date().toISOString() });
  }

  private write(entry: RegistrationEntry): void {
    this.commit({ ...this.store.getSnapshot(), [entry.matchId]: entry });
  }

  private commit(entries: Entries): void {
    const pruned = prune(entries);
    writeJson(STORAGE_KEY, pruned);
    this.store.set(pruned);
  }
}

export const registrationQueue = new RegistrationQueue();
