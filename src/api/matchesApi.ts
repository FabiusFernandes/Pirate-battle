import { ApiError, http } from './client';
import type { HistoryQuery, MatchRecord, MatchRecordInput, Page, RankingEntry, RankingQuery, RegisterMatchResponse } from './contracts';

function assertPage<T>(data: unknown): Page<T> {
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as Page<T>).items) ||
    typeof (data as Page<T>).totalPages !== 'number' ||
    typeof (data as Page<T>).revision !== 'number'
  ) {
    throw new ApiError('invalid', 'Malformed page response');
  }
  return data as Page<T>;
}

export async function fetchRanking(query: RankingQuery, signal?: AbortSignal): Promise<Page<RankingEntry>> {
  const { data } = await http.get<unknown>('/ranking', { params: query, ...(signal ? { signal } : {}) });
  return assertPage<RankingEntry>(data);
}

export async function fetchHistory(query: HistoryQuery, signal?: AbortSignal): Promise<Page<MatchRecord>> {
  const { playerId, ...page } = query;
  const { data } = await http.get<unknown>(`/players/${encodeURIComponent(playerId)}/matches`, {
    params: page,
    ...(signal ? { signal } : {}),
  });
  return assertPage<MatchRecord>(data);
}

export async function registerMatch(record: MatchRecordInput): Promise<RegisterMatchResponse> {
  const { data } = await http.post<RegisterMatchResponse>('/matches', record, {
    // Idempotency key: the server deduplicates on it (it is also the matchId in the body).
    headers: { 'Idempotency-Key': record.matchId },
  });
  if (typeof data !== 'object' || typeof data.record !== 'object' || typeof data.created !== 'boolean') {
    throw new ApiError('invalid', 'Malformed register response');
  }
  return data;
}
