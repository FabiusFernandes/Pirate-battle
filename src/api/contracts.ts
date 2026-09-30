/**
 * REST contracts for the ranking and match history APIs. Shared by the Axios client, the
 * TanStack Query hooks and the MSW mock server, so both sides always agree on the shape.
 *
 * Endpoints (base URL `VITE_API_BASE_URL`, default `/api`):
 *   GET  /ranking?sessionTime=&spawnInterval=&page=&pageSize=   → Page<RankingEntry>
 *   GET  /players/:playerId/matches?page=&pageSize=            → Page<MatchRecord>
 *   POST /matches  (body: MatchRecordInput)                    → 201 | 200  RegisterMatchResponse
 *
 * `POST /matches` is idempotent on `matchId`: re-sending a record that already exists
 * returns the stored record with `created: false` and status 200, never a duplicate.
 */

export type EndReason = 'time_up' | 'destroyed';

/** The gameplay setup a match was played with. Ranking only compares identical setups. */
export interface MatchSetup {
  sessionTime: number;
  spawnInterval: number;
}

export interface MatchRecordInput {
  /** Client-generated UUID; doubles as the idempotency key. */
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  /** Effective (active) play time, seconds. */
  duration: number;
  reason: EndReason;
  setup: MatchSetup;
  seed: number;
  /** ISO timestamp of the end of the match. */
  endedAt: string;
}

export interface MatchRecord extends MatchRecordInput {
  /** ISO timestamp when the server stored the record. */
  recordedAt: string;
}

export interface RankingEntry {
  rank: number;
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  duration: number;
  reason: EndReason;
  endedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  /**
   * Monotonic data version of the server. The client never replaces cached data with a
   * response carrying an older revision (protects against out-of-order responses).
   */
  revision: number;
}

export interface RankingQuery extends MatchSetup {
  page: number;
  pageSize: number;
}

export interface HistoryQuery {
  playerId: string;
  page: number;
  pageSize: number;
}

export interface RegisterMatchResponse {
  record: MatchRecord;
  /** false when the match had already been registered (idempotent replay). */
  created: boolean;
  revision: number;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

/**
 * Deterministic ranking order for matches with the same setup:
 * 1. higher score; 2. survived (time up) before sunk; 3. longer survival;
 * 4. earlier `endedAt` (who reached the score first); 5. `matchId` (total order).
 */
export function compareRanking(
  a: Pick<RankingEntry, 'score' | 'reason' | 'duration' | 'endedAt' | 'matchId'>,
  b: Pick<RankingEntry, 'score' | 'reason' | 'duration' | 'endedAt' | 'matchId'>,
): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.reason !== b.reason) return a.reason === 'time_up' ? -1 : 1;
  if (a.duration !== b.duration) return b.duration - a.duration;
  if (a.endedAt !== b.endedAt) return a.endedAt < b.endedAt ? -1 : 1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

export const PAGE_SIZE = 5;
