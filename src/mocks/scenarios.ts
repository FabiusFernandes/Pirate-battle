import { Rng } from '@/game/sim/math';
import { Store } from '@/lib/store';
import { readJson, writeJson } from '@/lib/storage';

export type Endpoint = 'ranking' | 'history' | 'register';

/** What the mock server does with one request. */
export type Behavior =
  | { kind: 'ok' }
  | { kind: 'empty' }
  | { kind: 'status'; status: number }
  | { kind: 'network-error' }
  /** Never answers: the client times out. */
  | { kind: 'hang' }
  /** Stores the record, then never answers (lost response): exercises idempotent resends. */
  | { kind: 'commit-then-hang' };

export type Latency = { kind: 'fixed'; ms: number } | { kind: 'range'; min: number; max: number } | { kind: 'alternating'; slow: number; fast: number };

export interface ScenarioDefinition {
  id: string;
  label: string;
  description: string;
  latency: Latency;
  behavior: Partial<Record<Endpoint, Behavior>>;
  /** Adds 120 extra ranking fixtures for the default setup. */
  manyPages?: boolean;
  /** Behaviour after the first N requests to an endpoint (e.g. "first register times out"). */
  afterFirst?: { endpoint: Endpoint; count: number; behavior: Behavior };
}

const NORMAL: Latency = { kind: 'range', min: 120, max: 450 };

export const SCENARIOS: readonly ScenarioDefinition[] = [
  { id: 'success', label: 'Success', description: 'Everything works, with realistic latency.', latency: NORMAL, behavior: {} },
  {
    id: 'empty',
    label: 'Empty lists',
    description: 'Ranking and history return no entries.',
    latency: NORMAL,
    behavior: { ranking: { kind: 'empty' }, history: { kind: 'empty' } },
  },
  { id: 'many-pages', label: 'Many pages', description: '120 extra ranking entries for the 120 s / 3 s setup.', latency: NORMAL, behavior: {}, manyPages: true },
  { id: 'slow', label: 'Slow network', description: 'Every response takes 2.5 s.', latency: { kind: 'fixed', ms: 2500 }, behavior: {} },
  {
    id: 'variable-latency',
    label: 'Variable latency',
    description: 'Seeded random latency between 100 ms and 3 s.',
    latency: { kind: 'range', min: 100, max: 3000 },
    behavior: {},
  },
  {
    id: 'out-of-order',
    label: 'Out-of-order responses',
    description: 'Odd requests take 2.5 s, even ones 150 ms, so later requests often answer first.',
    latency: { kind: 'alternating', slow: 2500, fast: 150 },
    behavior: {},
  },
  { id: 'timeout', label: 'Timeout', description: 'No endpoint ever answers; the client times out.', latency: NORMAL, behavior: { ranking: { kind: 'hang' }, history: { kind: 'hang' }, register: { kind: 'hang' } } },
  {
    id: 'offline',
    label: 'Connection failure',
    description: 'Every request fails at the network level.',
    latency: { kind: 'fixed', ms: 50 },
    behavior: { ranking: { kind: 'network-error' }, history: { kind: 'network-error' }, register: { kind: 'network-error' } },
  },
  {
    id: 'server-error',
    label: 'HTTP 500',
    description: 'Every endpoint answers 500 Internal Server Error (retried).',
    latency: NORMAL,
    behavior: { ranking: { kind: 'status', status: 500 }, history: { kind: 'status', status: 500 }, register: { kind: 'status', status: 500 } },
  },
  {
    id: 'bad-request',
    label: 'HTTP 400',
    description: 'Every endpoint answers 400 Bad Request (not retried).',
    latency: NORMAL,
    behavior: { ranking: { kind: 'status', status: 400 }, history: { kind: 'status', status: 400 }, register: { kind: 'status', status: 400 } },
  },
  { id: 'ranking-down', label: 'Ranking fails', description: 'Ranking answers 503; history works.', latency: NORMAL, behavior: { ranking: { kind: 'status', status: 503 } } },
  { id: 'history-down', label: 'History fails', description: 'History answers 503; ranking works.', latency: NORMAL, behavior: { history: { kind: 'status', status: 503 } } },
  {
    id: 'register-timeout-after-commit',
    label: 'Register: lost response',
    description: 'The first registration is stored but its response never arrives; the resend recovers it without a duplicate.',
    latency: NORMAL,
    behavior: {},
    afterFirst: { endpoint: 'register', count: 0, behavior: { kind: 'commit-then-hang' } },
  },
  {
    id: 'register-unavailable',
    label: 'Register unavailable',
    description: 'Registration answers 503 until you switch back to Success; the match stays pending and is sent after recovery.',
    latency: NORMAL,
    behavior: { register: { kind: 'status', status: 503 } },
  },
];

const STORAGE_KEY = 'pirate-battle:mock-scenario';
const params = new URLSearchParams(window.location.search);

function findScenario(id: string | null | undefined): ScenarioDefinition | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

function initialScenario(): string {
  // ?scenario=<id> selects (and persists) a scenario; otherwise the last selection is kept.
  const fromUrl = findScenario(params.get('scenario'));
  if (fromUrl) {
    writeJson(STORAGE_KEY, fromUrl.id);
    return fromUrl.id;
  }
  const stored = readJson(STORAGE_KEY);
  return typeof stored === 'string' && findScenario(stored) ? stored : 'success';
}

export const activeScenario = new Store<string>(initialScenario());

export function setScenario(id: string): void {
  if (!findScenario(id)) return;
  writeJson(STORAGE_KEY, id);
  activeScenario.set(id);
  requestCounts.clear();
}

export function currentScenario(): ScenarioDefinition {
  return findScenario(activeScenario.getSnapshot()) ?? (SCENARIOS[0] as ScenarioDefinition);
}

/**
 * Latency control. `?mockLatency=<ms>` forces a fixed latency for scenarios that use the
 * normal range (tests pass 0); scenarios whose point *is* latency (slow, variable,
 * out-of-order) keep theirs. `?mockSeed=<n>` seeds the random latency.
 */
const LATENCY_OVERRIDE = params.get('mockLatency');
const latencyRng = new Rng(Number(params.get('mockSeed') ?? 1337) || 1337);
const requestCounts = new Map<Endpoint, number>();
let totalRequests = 0;

export function nextRequest(endpoint: Endpoint): { behavior: Behavior; latency: number } {
  const scenario = currentScenario();
  const seen = requestCounts.get(endpoint) ?? 0;
  requestCounts.set(endpoint, seen + 1);
  totalRequests += 1;

  let behavior: Behavior = scenario.behavior[endpoint] ?? { kind: 'ok' };
  if (scenario.afterFirst?.endpoint === endpoint && seen <= scenario.afterFirst.count) behavior = scenario.afterFirst.behavior;

  let latency: number;
  const l = scenario.latency;
  if (l === NORMAL && LATENCY_OVERRIDE !== null && Number.isFinite(Number(LATENCY_OVERRIDE))) latency = Number(LATENCY_OVERRIDE);
  else if (l.kind === 'fixed') latency = l.ms;
  else if (l.kind === 'range') latency = Math.round(latencyRng.range(l.min, l.max));
  else latency = totalRequests % 2 === 1 ? l.slow : l.fast;
  return { behavior, latency };
}
