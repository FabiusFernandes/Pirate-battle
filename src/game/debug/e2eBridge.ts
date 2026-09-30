import type { DeepPartial, EnemyKind, GameConfig } from '@/game/config/gameConfig';
import type { GameHost } from '@/game/engine/GameHost';
import type { GameSession } from '@/game/engine/GameSession';
import { DEG_TO_RAD } from '@/game/sim/math';
import type { SimSnapshot } from '@/game/sim/types';

/**
 * Test instrumentation, enabled only with `?e2e` in the URL (also in the production build,
 * which is what the E2E suite runs against). It lets tests observe state, control the clock
 * and set up scenarios; the rules, input handling, collisions and rendering stay the real ones.
 *
 * - `?e2e`            enables the bridge and the manual clock (simulation only advances via `advance`).
 * - `?e2e&realtime`   keeps the real frame clock (for pause/blur tests).
 * - `?seed=<n>`       fixes the match seed (also works without `?e2e`).
 */
const params = new URLSearchParams(window.location.search);

export const E2E_ENABLED = params.has('e2e');
export const MANUAL_CLOCK = E2E_ENABLED && !params.has('realtime');
const URL_SEED = params.get('seed');

interface PendingSetup {
  overrides: DeepPartial<GameConfig> | undefined;
  seed: number | undefined;
}

const pending: PendingSetup = { overrides: undefined, seed: URL_SEED !== null ? Number(URL_SEED) : undefined };

let active: { session: GameSession; host: GameHost } | null = null;

export function e2eConfigOverrides(): DeepPartial<GameConfig> | undefined {
  return E2E_ENABLED ? pending.overrides : undefined;
}

export function e2eSeed(): number | undefined {
  return pending.seed !== undefined && Number.isFinite(pending.seed) ? pending.seed : undefined;
}

export function registerE2ESession(session: GameSession, host: GameHost): () => void {
  if (!E2E_ENABLED) return () => undefined;
  active = { session, host };
  return () => {
    if (active?.session === session) active = null;
  };
}

export interface PirateE2EApi {
  readonly manualClock: boolean;
  /** Config overrides applied to matches started after this call. */
  setOverrides(overrides: DeepPartial<GameConfig> | undefined): void;
  setSeed(seed: number | undefined): void;
  /** True once a match is mounted and rendering. */
  isReady(): boolean;
  state(): (SimSnapshot & { session: string; pauseReason: string | null; matchId: string; renderables: number; effects: number }) | null;
  /** Advances the manual clock by `ms` of simulation time and returns the new state. */
  advance(ms: number): ReturnType<PirateE2EApi['state']>;
  spawnEnemy(kind: EnemyKind, x: number, y: number, headingDeg?: number): number;
  setPlayerPose(x: number, y: number, headingDeg: number): void;
  /** Converts world coordinates into page (client) coordinates. */
  worldToClient(x: number, y: number): { x: number; y: number } | null;
}

function requireActive(): { session: GameSession; host: GameHost } {
  if (!active) throw new Error('No active match');
  return active;
}

const api: PirateE2EApi = {
  manualClock: MANUAL_CLOCK,
  setOverrides(overrides) {
    pending.overrides = overrides;
  },
  setSeed(seed) {
    pending.seed = seed;
  },
  isReady() {
    return active?.host.isRendering ?? false;
  },
  state() {
    if (!active) return null;
    const { session, host } = active;
    return {
      ...session.simulation.snapshot(),
      session: session.currentStatus,
      pauseReason: session.currentPauseReason,
      matchId: session.matchId,
      renderables: host.renderableCount,
      effects: session.renderables,
    };
  },
  advance(ms) {
    const { session } = requireActive();
    if (!MANUAL_CLOCK) throw new Error('advance() requires the manual clock (?e2e without &realtime)');
    session.advanceBy(ms / 1000);
    return api.state();
  },
  spawnEnemy(kind, x, y, headingDeg) {
    const { session } = requireActive();
    const spawner = session.simulation.spawner;
    spawner.spawn(kind, { x, y }, headingDeg === undefined ? undefined : headingDeg * DEG_TO_RAD);
    const enemies = session.simulation.world.enemies;
    const id = enemies[enemies.length - 1]?.id ?? -1;
    session.advanceBy(0);
    return id;
  },
  setPlayerPose(x, y, headingDeg) {
    const { session } = requireActive();
    const player = session.simulation.world.player;
    player.x = player.prevX = x;
    player.y = player.prevY = y;
    player.heading = player.prevHeading = headingDeg * DEG_TO_RAD;
    player.speed = 0;
    session.advanceBy(0);
  },
  worldToClient(x, y) {
    if (!active) return null;
    return active.host.worldToClient(x, y);
  },
};

declare global {
  interface Window {
    __pirate?: PirateE2EApi;
  }
}

if (E2E_ENABLED) window.__pirate = api;
