import { QueryClient, keepPreviousData, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { ApiError} from './client';
import { toApiError } from './client';
import { PAGE_SIZE, type MatchRecord, type MatchSetup, type Page, type RankingEntry } from './contracts';
import { fetchHistory, fetchRanking } from './matchesApi';

const MAX_RETRIES = 2;

export function retryDelay(attempt: number): number {
  return Math.min(4000, 400 * 2 ** attempt);
}

/** Retries only transient failures (timeouts, network, 5xx, 408, 429), at most twice. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && toApiError(error).retryable;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        staleTime: 10_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: shouldRetry,
        retryDelay,
      },
    },
  });
}

export const queryKeys = {
  ranking: (setup: MatchSetup, page: number) => ['ranking', setup.sessionTime, setup.spawnInterval, page] as const,
  rankingAll: ['ranking'] as const,
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
  historyAll: ['history'] as const,
};

/**
 * Wraps a page fetch so a response with an older server revision than the cached data never
 * replaces it. TanStack Query already cancels superseded fetches of the same key; this guard
 * also covers responses that could not be cancelled and arrive out of order.
 */
async function freshest<T>(client: QueryClient, key: QueryKey, fetcher: () => Promise<Page<T>>): Promise<Page<T>> {
  const page = await fetcher();
  const cached = client.getQueryData<Page<T>>(key);
  return cached && cached.revision > page.revision ? cached : page;
}

export function useRanking(setup: MatchSetup, page: number) {
  const client = useQueryClient();
  const key = queryKeys.ranking(setup, page);
  return useQuery<Page<RankingEntry>, ApiError>({
    queryKey: key,
    queryFn: ({ signal }) =>
      freshest(client, key, () => fetchRanking({ ...setup, page, pageSize: PAGE_SIZE }, signal)).catch((e: unknown) => {
        throw toApiError(e);
      }),
    // Keep showing the previous page while the next one loads (no flashing empty table).
    placeholderData: keepPreviousData,
    // Re-displaying the tab always refreshes it in the background.
    refetchOnMount: 'always',
  });
}

export function useHistory(playerId: string, page: number) {
  const client = useQueryClient();
  const key = queryKeys.history(playerId, page);
  return useQuery<Page<MatchRecord>, ApiError>({
    queryKey: key,
    queryFn: ({ signal }) =>
      freshest(client, key, () => fetchHistory({ playerId, page, pageSize: PAGE_SIZE }, signal)).catch((e: unknown) => {
        throw toApiError(e);
      }),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}
