import { ARENA_MAP } from '../../src/game/world/arenaMap';
import { buildArenaGeometry, circlePenetration } from '../../src/game/world/obstacles';
import { expect, test } from './fixtures';
import { NO_SPAWNS, advance, headingDeg, merge, setPlayerPose, spawnEnemy, startMatch } from './helpers';

const geometry = buildArenaGeometry(ARENA_MAP);

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test.describe('enemies', () => {
  test('chaser pursues the player, rams it, explodes and does not score', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await spawnEnemy(page, 'chaser', 300, 470, 90);

    const a = await advance(page, 1000);
    const chaser = a.enemies[0];
    expect(chaser).toBeDefined();
    // Turned from south (90°) towards the player (east, 0°) and closed in.
    expect(Math.abs(headingDeg(chaser!))).toBeLessThan(30);
    expect(distance(chaser!, a.player)).toBeLessThan(500 - 60);

    let s = a;
    for (let i = 0; i < 40 && s.enemies.length > 0; i++) s = await advance(page, 100);
    expect(s.enemies).toHaveLength(0);
    expect(s.player.health).toBe(100 - 20);
    expect(s.stats.chasersRammed).toBe(1);
    expect(s.score).toBe(0);
  });

  test('chaser steers around islands without overlapping them', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await setPlayerPose(page, 1420, 160, 180);
    // The sand island (x 1096–1272) sits between the chaser and the player.
    await spawnEnemy(page, 'chaser', 960, 160, 0);

    let s = await advance(page, 0);
    for (let i = 0; i < 120 && s.enemies.length > 0; i++) {
      s = await advance(page, 100);
      for (const enemy of s.enemies) {
        for (const obstacle of geometry.obstacles) {
          expect(circlePenetration(obstacle, enemy.x, enemy.y, enemy.radius)?.depth ?? 0).toBeLessThan(0.5);
        }
      }
    }
    expect(s.stats.chasersRammed).toBe(1);
  });

  test('shooter approaches, holds its range and fires only within range', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await spawnEnemy(page, 'shooter', 250, 470, 0);

    const early = await advance(page, 500);
    expect(early.stats.enemyShots).toBe(0);
    expect(distance(early.enemies[0]!, early.player)).toBeGreaterThan(400);

    let s = early;
    let minDistance = Infinity;
    for (let i = 0; i < 60; i++) {
      s = await advance(page, 100);
      minDistance = Math.min(minDistance, distance(s.enemies[0]!, s.player));
    }
    expect(s.stats.enemyShots).toBeGreaterThanOrEqual(2);
    expect(s.player.health).toBeLessThan(100);
    expect(s.player.health % 10).toBe(0);
    // Stops around its preferred range (300) instead of ramming.
    expect(minDistance).toBeGreaterThan(260);
    expect(minDistance).toBeLessThan(320);
  });

  test('shooter respects its cooldown and needs line of sight', async ({ page }) => {
    await startMatch(page, { overrides: merge(NO_SPAWNS, { shooter: { maxSpeed: 0, acceleration: 0, attackRange: 600 } }) });
    await setPlayerPose(page, 1420, 160, 180);
    await spawnEnemy(page, 'shooter', 960, 160, 0);
    const hidden = await advance(page, 4000);
    expect(hidden.stats.enemyShots).toBe(0);

    await setPlayerPose(page, 960, 500, 180);
    const visible = await advance(page, 4000);
    // Fires as soon as it faces the player, then every 1.8 s: 2–3 shots in 4 s.
    expect(visible.stats.enemyShots).toBeGreaterThanOrEqual(2);
    expect(visible.stats.enemyShots).toBeLessThanOrEqual(3);
  });

  test('enemies take damage and destroyed enemies stop colliding and shooting', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await setPlayerPose(page, 400, 450, 0);
    await spawnEnemy(page, 'shooter', 700, 450, 180);
    await page.keyboard.down('Space');
    let s = await advance(page, 0);
    for (let i = 0; i < 30 && s.enemies.length > 0; i++) s = await advance(page, 100);
    await page.keyboard.up('Space');
    expect(s.enemies).toHaveLength(0);
    expect(s.score).toBe(1);
    const shotsWhenSunk = s.stats.enemyShots;
    const healthWhenSunk = s.player.health;
    const later = await advance(page, 3000);
    expect(later.stats.enemyShots).toBe(shotsWhenSunk);
    // Shots already in the air may still land; nothing new is fired.
    expect(later.player.health).toBeGreaterThanOrEqual(healthWhenSunk - 10);
  });
});

test.describe('spawning', () => {
  test('spawns on the configured interval, both types, away from the player and obstacles', async ({ page }) => {
    await startMatch(page, { seed: 42, overrides: { spawn: { initialDelay: 2, interval: 2 } } });
    const none = await advance(page, 1900);
    expect(none.spawnCount).toBe(0);

    const kinds: string[] = [];
    let known = new Set<number>();
    for (let n = 1; n <= 5; n++) {
      const s = await advance(page, n === 1 ? 200 : 2000);
      expect(s.spawnCount).toBe(n);
      const fresh = s.enemies.filter((e) => !known.has(e.id));
      expect(fresh).toHaveLength(1);
      const enemy = fresh[0]!;
      kinds.push(enemy.kind);
      expect(distance(enemy, s.player)).toBeGreaterThanOrEqual(480 - 25);
      expect(enemy.x).toBeGreaterThanOrEqual(enemy.radius);
      expect(enemy.x).toBeLessThanOrEqual(1600 - enemy.radius);
      expect(enemy.y).toBeGreaterThanOrEqual(enemy.radius);
      expect(enemy.y).toBeLessThanOrEqual(896 - enemy.radius);
      for (const obstacle of geometry.obstacles) {
        expect(circlePenetration(obstacle, enemy.x, enemy.y, enemy.radius)).toBeNull();
      }
      known = new Set(s.enemies.map((e) => e.id));
    }
    expect(kinds.slice(0, 2)).toEqual(['chaser', 'shooter']);
  });

  test('same seed produces the same spawns', async ({ page }) => {
    const run = async () => {
      await startMatch(page, { seed: 99 });
      const s = await advance(page, 10_000);
      return s.enemies.map((e) => `${e.kind}:${e.x.toFixed(3)},${e.y.toFixed(3)}`);
    };
    const first = await run();
    const second = await run();
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });
});
