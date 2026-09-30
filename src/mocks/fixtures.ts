import type { EndReason, MatchRecord, MatchSetup } from '@/api/contracts';
import { Rng } from '@/game/sim/math';

/**
 * Deterministic fixture data for the mock server: other captains' matches. Generated from a
 * fixed seed and fixed dates, so every environment (dev, tests, deployed demo) and every
 * visual snapshot sees exactly the same records.
 */
const CAPTAINS = [
  'Captain Flint',
  'Red Sparrow',
  'Storm Rider',
  'Sea Wolf',
  'Anne Bonny',
  'Black Bart',
  'Calico Jack',
  "Grace O'Malley",
  'Mary Read',
  'Long Ben',
  'Salty Pete',
  'Iron Hook',
] as const;

/** Setups with fixture data, and how many matches each has. */
const FIXTURE_SETUPS: readonly (MatchSetup & { count: number })[] = [
  { sessionTime: 120, spawnInterval: 3, count: 14 },
  { sessionTime: 60, spawnInterval: 3, count: 6 },
  { sessionTime: 180, spawnInterval: 3, count: 8 },
  { sessionTime: 120, spawnInterval: 2, count: 7 },
  { sessionTime: 90, spawnInterval: 2.5, count: 4 },
];

const BASE_TIME = Date.parse('2026-09-08T21:42:00.000Z');

function fixtureId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function build(count: number, setup: MatchSetup, rng: Rng, startIndex: number): MatchRecord[] {
  const out: MatchRecord[] = [];
  for (let i = 0; i < count; i++) {
    const n = startIndex + i;
    const captain = CAPTAINS[n % CAPTAINS.length] ?? 'Captain Flint';
    const destroyed = rng.next() < 0.35;
    const reason: EndReason = destroyed ? 'destroyed' : 'time_up';
    const duration = destroyed ? Math.round(rng.range(0.35, 0.95) * setup.sessionTime * 100) / 100 : setup.sessionTime;
    const perMinute = rng.range(4, 14) * (3 / setup.spawnInterval);
    const score = Math.max(0, Math.round((perMinute * duration) / 60));
    const endedAt = new Date(BASE_TIME - n * 26 * 60_000 - Math.floor(rng.range(0, 20)) * 60_000).toISOString();
    out.push({
      matchId: fixtureId(n),
      playerId: `fixture-${captain.toLowerCase().replace(/[^a-z]+/g, '-')}`,
      playerName: captain,
      score,
      duration,
      reason,
      setup: { sessionTime: setup.sessionTime, spawnInterval: setup.spawnInterval },
      seed: n,
      endedAt,
      recordedAt: endedAt,
    });
  }
  return out;
}

export function createFixtures(): MatchRecord[] {
  const rng = new Rng(20260908);
  const records: MatchRecord[] = [];
  let index = 1;
  for (const setup of FIXTURE_SETUPS) {
    records.push(...build(setup.count, setup, rng, index));
    index += setup.count;
  }
  return records;
}

/** Extra records for the "many pages" scenario (default setup only). */
export function createManyPageFixtures(): MatchRecord[] {
  return build(120, { sessionTime: 120, spawnInterval: 3 }, new Rng(777), 1000);
}
