import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { toApiError, type ApiError } from './client';
import type { MatchRecordInput, RegisterMatchResponse } from './contracts';
import { registerMatch } from './matchesApi';
import { queryKeys } from './queries';
import { registrationQueue } from './registrationQueue';

/**
 * Headless component that drains the registration queue through a TanStack Query mutation,
 * one match at a time. Transient failures are retried by the mutation (backoff); when those
 * run out the entry is marked `failed` and stays in the queue for a manual retry, the next
 * app start or the browser coming back online. On success both tabs are invalidated.
 *
 * Duplicates are impossible by construction: one queue entry per matchId, only `pending`
 * entries are sent, and the server treats matchId as an idempotency key (a resend after a
 * lost response returns the existing record).
 */
export function RegistrationManager() {
  const queryClient = useQueryClient();
  const busy = useRef(false);

  const { mutateAsync } = useMutation<RegisterMatchResponse, ApiError, MatchRecordInput>({
    mutationKey: ['register-match'],
    mutationFn: (record) =>
      registerMatch(record).catch((e: unknown) => {
        throw toApiError(e);
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.rankingAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.historyAll }),
      ]);
    },
  });

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (let next = registrationQueue.nextPending(); next; next = registrationQueue.nextPending()) {
        const { matchId, record } = next;
        registrationQueue.markSubmitting(matchId);
        try {
          const response = await mutateAsync(record);
          registrationQueue.markConfirmed(matchId, response.created);
        } catch (error: unknown) {
          registrationQueue.markFailed(matchId, toApiError(error).userMessage);
        }
      }
    } finally {
      busy.current = false;
    }
  }, [mutateAsync]);

  useEffect(() => {
    // Anything that failed before a refresh gets another automatic chance on start.
    registrationQueue.retryAllFailed();
    void pump();
    const unsubscribe = registrationQueue.store.subscribe(() => {
      void pump();
    });
    const onOnline = (): void => {
      registrationQueue.retryAllFailed();
    };
    window.addEventListener('online', onOnline);
    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
    };
  }, [pump]);

  return null;
}
