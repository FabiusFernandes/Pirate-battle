import type { Page } from '@playwright/test';
import type { DeepPartial, EnemyKind, GameConfig } from '../../src/game/config/gameConfig';
import type { PirateE2EApi } from '../../src/game/debug/e2eBridge';
// Brings the `window.__pirateMocks` declaration into the tests' type scope.
export type { PirateMocksApi } from '../../src/mocks/e2eControls';
import { expect } from './fixtures';

export type GameState = NonNullable<ReturnType<PirateE2EApi['state']>>;

/** Spawner effectively disabled, for tests that place enemies themselves. */
export const NO_SPAWNS: DeepPartial<GameConfig> = { spawn: { initialDelay: 1e6 } };

/** Stationary target dummies: enemies that neither move, turn nor shoot. */
export const DUMMY_ENEMIES: DeepPartial<GameConfig> = {
  chaser: { maxSpeed: 0, acceleration: 0, turnRate: 0 },
  shooter: { maxSpeed: 0, acceleration: 0, turnRate: 0, attackRange: 0 },
};

/** Merges scenario fragments section by section (one level deep is all the scenarios need). */
export function merge(...parts: DeepPartial<GameConfig>[]): DeepPartial<GameConfig> {
  const out: Record<string, object> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part) as [string, object][]) out[key] = { ...out[key], ...value };
  }
  return out;
}

export interface StartOptions {
  seed?: number;
  overrides?: DeepPartial<GameConfig>;
  /** Use the real frame clock instead of the manual one. */
  realtime?: boolean;
  /** Skip navigation (already on the menu of an e2e page). */
  fromMenu?: boolean;
}

/** Opens the app with the test bridge, applies scenario setup and starts a match. */
export async function startMatch(page: Page, options: StartOptions = {}): Promise<GameState> {
  const { seed = 1, overrides, realtime = false, fromMenu = false } = options;
  if (!fromMenu) await page.goto(`/?e2e&seed=${seed}${realtime ? '&realtime' : ''}`);
  await page.evaluate((o) => {
    window.__pirate?.setOverrides(o);
  }, overrides);
  await page.getByTestId('menu-play').click();
  await page.waitForFunction(() => window.__pirate?.isReady() === true);
  return state(page);
}

export async function state(page: Page): Promise<GameState> {
  const s = await page.evaluate(() => window.__pirate?.state() ?? null);
  if (!s) throw new Error('No active match');
  return s;
}

/** Advances the manual simulation clock. */
export async function advance(page: Page, ms: number): Promise<GameState> {
  const s = await page.evaluate((t) => window.__pirate?.advance(t) ?? null, ms);
  if (!s) throw new Error('No active match');
  return s;
}

/** Holds keys while advancing the simulation clock, then releases them. */
export async function holdKeys(page: Page, keys: string[], ms: number): Promise<GameState> {
  for (const key of keys) await page.keyboard.down(key);
  const s = await advance(page, ms);
  for (const key of keys) await page.keyboard.up(key);
  return s;
}

export async function setPlayerPose(page: Page, x: number, y: number, headingDeg: number): Promise<void> {
  await page.evaluate(([px, py, h]) => window.__pirate?.setPlayerPose(px, py, h), [x, y, headingDeg] as const);
}

export async function spawnEnemy(page: Page, kind: EnemyKind, x: number, y: number, headingDeg?: number): Promise<number> {
  return page.evaluate(
    ([k, px, py, h]) => window.__pirate?.spawnEnemy(k, px, py, h) ?? -1,
    [kind, x, y, headingDeg] as const,
  );
}

export function headingDeg(s: { heading: number }): number {
  return (s.heading * 180) / Math.PI;
}

export async function expectHudScore(page: Page, score: number): Promise<void> {
  await expect(page.getByTestId('status-score')).toHaveText(String(score));
}
