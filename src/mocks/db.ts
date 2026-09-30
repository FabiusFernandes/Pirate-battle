import { compareRanking, type MatchRecord, type MatchRecordInput, type MatchSetup, type Page, type RankingEntry } from '@/api/contracts';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import { createFixtures, createManyPageFixtures } from './fixtures';

const STORAGE_KEY = 'pirate-battle:mock-db';

interface DbState {
  /** Records confirmed by the "server", keyed by matchId. Fixtures are not stored here. */
  records: Record<string, MatchRecord>;
  revision: number;
}

function load(): DbState {
  const stored = readJson(STORAGE_KEY);
  if (typeof stored === 'object' && stored !== null) {
    const { records, revision } = stored as Partial<DbState>;
    if (typeof records === 'object' && typeof revision === 'number') return { records, revision };
  }
  return { records: {}, revision: 1 };
}

/**
 * The mock server's database. Confirmed records persist in localStorage (they survive a
 * refresh, like a real backend would), on top of the deterministic fixtures. Ranking and
 * history are derived from the same records, so both tabs are always consistent.
 */
class MockDb {
  private state: DbState = load();
  private readonly fixtures = createFixtures();
  private readonly manyPageFixtures = createManyPageFixtures();

  get revision(): number {
    return this.state.revision;
  }

  get(matchId: string): MatchRecord | undefined {
    return this.state.records[matchId];
  }

  /** Idempotent insert: an existing matchId returns the stored record unchanged. */
  insert(input: MatchRecordInput): { record: MatchRecord; created: boolean } {
    const existing = this.get(input.matchId);
    if (existing) return { record: existing, created: false };
    const record: MatchRecord = { ...input, recordedAt: new Date().toISOString() };
    this.state = { records: { ...this.state.records, [record.matchId]: record }, revision: this.state.revision + 1 };
    writeJson(STORAGE_KEY, this.state);
    return { record, created: true };
  }

  ranking(setup: MatchSetup, page: number, pageSize: number, options: { manyPages: boolean }): Page<RankingEntry> {
    const all = [...this.fixtures, ...(options.manyPages ? this.manyPageFixtures : []), ...Object.values(this.state.records)]
      .filter((r) => r.setup.sessionTime === setup.sessionTime && r.setup.spawnInterval === setup.spawnInterval)
      .sort(compareRanking);
    return this.paginate(
      all.map((r, i) => ({
        rank: i + 1,
        matchId: r.matchId,
        playerId: r.playerId,
        playerName: r.playerName,
        score: r.score,
        duration: r.duration,
        reason: r.reason,
        endedAt: r.endedAt,
      })),
      page,
      pageSize,
    );
  }

  history(playerId: string, page: number, pageSize: number): Page<MatchRecord> {
    const mine = Object.values(this.state.records)
      .filter((r) => r.playerId === playerId)
      .sort((a, b) => (a.endedAt < b.endedAt ? 1 : a.endedAt > b.endedAt ? -1 : 0));
    return this.paginate(mine, page, pageSize);
  }

  reset(): void {
    removeKey(STORAGE_KEY);
    // Keep the revision increasing so clients never mistake new data for stale data.
    this.state = { records: {}, revision: this.state.revision + 1 };
    writeJson(STORAGE_KEY, this.state);
  }

  private paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const current = Math.min(Math.max(1, page), totalPages);
    const start = (current - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      page: current,
      pageSize,
      totalItems: items.length,
      totalPages,
      revision: this.state.revision,
    };
  }
}

export const mockDb = new MockDb();
