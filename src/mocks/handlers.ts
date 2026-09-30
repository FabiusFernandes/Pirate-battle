import { HttpResponse, delay, http } from 'msw';
import type { ApiErrorBody, MatchRecordInput, RegisterMatchResponse } from '@/api/contracts';
import { mockDb } from './db';
import { currentScenario, nextRequest, type Behavior, type Endpoint } from './scenarios';

const API = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

function error(status: number, code: string, message: string) {
  return HttpResponse.json<ApiErrorBody>({ error: code, message }, { status });
}

function intParam(url: URL, name: string, fallback: number): number {
  const value = Number(url.searchParams.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Applies latency and the failure part of a behaviour. Returns a response to short-circuit, or null to proceed. */
async function simulate(endpoint: Endpoint): Promise<{ behavior: Behavior; response: Response | null }> {
  const { behavior, latency } = nextRequest(endpoint);
  if (latency > 0) await delay(latency);
  switch (behavior.kind) {
    case 'hang':
      await delay('infinite');
      return { behavior, response: null };
    case 'network-error':
      return { behavior, response: HttpResponse.error() };
    case 'status':
      return { behavior, response: error(behavior.status, `http_${behavior.status}`, `Simulated HTTP ${behavior.status}`) };
    default:
      return { behavior, response: null };
  }
}

function isRecordInput(value: unknown): value is MatchRecordInput {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const setup = v.setup as Record<string, unknown> | undefined;
  return (
    typeof v.matchId === 'string' &&
    v.matchId.length > 0 &&
    typeof v.playerId === 'string' &&
    typeof v.playerName === 'string' &&
    typeof v.score === 'number' &&
    v.score >= 0 &&
    typeof v.duration === 'number' &&
    (v.reason === 'time_up' || v.reason === 'destroyed') &&
    typeof setup?.sessionTime === 'number' &&
    typeof setup.spawnInterval === 'number' &&
    typeof v.endedAt === 'string'
  );
}

/** REST handlers for ranking and match history. Used by the browser worker in dev, tests and the deployed demo. */
export const handlers = [
  http.get(`${API}/ranking`, async ({ request }) => {
    const { behavior, response } = await simulate('ranking');
    if (response) return response;
    const url = new URL(request.url);
    const sessionTime = Number(url.searchParams.get('sessionTime'));
    const spawnInterval = Number(url.searchParams.get('spawnInterval'));
    if (!Number.isFinite(sessionTime) || !Number.isFinite(spawnInterval)) {
      return error(400, 'invalid_query', 'sessionTime and spawnInterval are required');
    }
    const page = mockDb.ranking({ sessionTime, spawnInterval }, intParam(url, 'page', 1), intParam(url, 'pageSize', 5), {
      manyPages: currentScenario().manyPages === true,
    });
    return HttpResponse.json(behavior.kind === 'empty' ? { ...page, items: [], totalItems: 0, totalPages: 1, page: 1 } : page);
  }),

  http.get(`${API}/players/:playerId/matches`, async ({ request, params }) => {
    const { behavior, response } = await simulate('history');
    if (response) return response;
    const url = new URL(request.url);
    const playerId = String(params.playerId);
    const page = mockDb.history(playerId, intParam(url, 'page', 1), intParam(url, 'pageSize', 5));
    return HttpResponse.json(behavior.kind === 'empty' ? { ...page, items: [], totalItems: 0, totalPages: 1, page: 1 } : page);
  }),

  http.post(`${API}/matches`, async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    const { behavior, response } = await simulate('register');
    if (response) return response;
    if (!isRecordInput(body)) return error(422, 'invalid_record', 'The match record is incomplete or invalid');
    const key = request.headers.get('Idempotency-Key');
    if (key !== null && key !== body.matchId) return error(422, 'key_mismatch', 'Idempotency-Key must equal matchId');

    const { record, created } = mockDb.insert(body);
    if (behavior.kind === 'commit-then-hang') {
      // The write happened, but the response is "lost": the client will time out and resend.
      await delay('infinite');
    }
    return HttpResponse.json<RegisterMatchResponse>({ record, created, revision: mockDb.revision }, { status: created ? 201 : 200 });
  }),
];
