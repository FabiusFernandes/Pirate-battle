import { expect, test } from './fixtures';
import { DUMMY_ENEMIES, NO_SPAWNS, advance, expectHudScore, holdKeys, merge, setPlayerPose, spawnEnemy, startMatch } from './helpers';

const SCENARIO = merge(NO_SPAWNS, DUMMY_ENEMIES);

test.describe('player weapons', () => {
  test('front cannon: one projectile, damage, cooldown and a single point per kill', async ({ page }) => {
    await startMatch(page, { overrides: SCENARIO });
    await setPlayerPose(page, 400, 450, 0);
    await spawnEnemy(page, 'chaser', 700, 450, 180);

    const shot = await holdKeys(page, ['Space'], 50);
    expect(shot.stats.playerShots.front).toBe(1);
    expect(shot.projectiles).toHaveLength(1);
    const ball = shot.projectiles[0];
    expect(ball?.vx).toBeCloseTo(560, 3);
    expect(ball?.vy).toBeCloseTo(0, 3);

    const hit = await advance(page, 600);
    expect(hit.enemies[0]?.health).toBe(50 - 34);
    expect(hit.projectiles).toHaveLength(0);
    expect(hit.stats.hitsOnEnemies).toBe(1);

    // Holding the trigger fires at most once per cooldown (0.4 s): 3 shots in 1 s.
    const held = await holdKeys(page, ['Space'], 1000);
    expect(held.stats.playerShots.front).toBe(1 + 3);

    const settled = await advance(page, 2000);
    expect(settled.enemies).toHaveLength(0);
    expect(settled.score).toBe(1);
    expect(settled.stats.enemiesSunk).toBe(1);
    // The killing shot and the following one: the extra ball flew through empty water.
    expect(settled.stats.hitsOnEnemies).toBe(2);
    await expectHudScore(page, 1);
  });

  test('broadsides fire three parallel projectiles to each side', async ({ page }) => {
    await startMatch(page, { overrides: SCENARIO });
    await setPlayerPose(page, 800, 450, 0);

    const left = await holdKeys(page, ['KeyQ'], 20);
    expect(left.stats.playerShots.left).toBe(1);
    expect(left.projectiles).toHaveLength(3);
    for (const p of left.projectiles) {
      expect(p.vx).toBeCloseTo(0, 3);
      expect(p.vy).toBeLessThan(0);
    }
    const xs = left.projectiles.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeCloseTo(24, 3);
    expect(xs[2]! - xs[1]!).toBeCloseTo(24, 3);

    const right = await holdKeys(page, ['KeyE'], 20);
    expect(right.stats.playerShots.right).toBe(1);
    const rightBalls = right.projectiles.filter((p) => p.vy > 0);
    expect(rightBalls).toHaveLength(3);

    // Each battery has its own 1.2 s cooldown.
    const heldLeft = await holdKeys(page, ['KeyQ'], 1000);
    expect(heldLeft.stats.playerShots.left).toBe(1);
    const reloaded = await holdKeys(page, ['KeyQ'], 400);
    expect(reloaded.stats.playerShots.left).toBe(2);
  });

  test('each projectile damages once; a broadside kill scores exactly one point', async ({ page }) => {
    await startMatch(page, { overrides: SCENARIO });
    await setPlayerPose(page, 800, 450, 0);
    await spawnEnemy(page, 'chaser', 800, 300, 0);

    await holdKeys(page, ['KeyQ'], 20);
    const after = await advance(page, 1500);
    // Two balls (25 + 25) sink the 50 HP chaser; the third passes the wreck.
    expect(after.stats.hitsOnEnemies).toBe(2);
    expect(after.enemies).toHaveLength(0);
    expect(after.score).toBe(1);
    expect(after.projectiles).toHaveLength(0);
    await expectHudScore(page, 1);
  });

  test('can sail, turn and fire at the same time', async ({ page }) => {
    const start = await startMatch(page, { overrides: SCENARIO });
    const s = await holdKeys(page, ['KeyW', 'KeyA', 'Space', 'KeyE'], 1000);
    expect(Math.hypot(s.player.x - start.player.x, s.player.y - start.player.y)).toBeGreaterThan(40);
    expect(s.player.heading).not.toBeCloseTo(start.player.heading, 1);
    expect(s.stats.playerShots.front).toBe(3);
    expect(s.stats.playerShots.right).toBe(1);
  });

  test('projectiles expire after their range', async ({ page }) => {
    await startMatch(page, { overrides: SCENARIO });
    await setPlayerPose(page, 200, 450, 0);
    await holdKeys(page, ['Space'], 20);
    const flying = await advance(page, 800);
    expect(flying.projectiles).toHaveLength(1);
    expect(flying.projectiles[0]?.traveled).toBeLessThan(560);
    const gone = await advance(page, 400);
    // 560 units at 560 u/s: gone after ~1 s, well before reaching the arena edge.
    expect(gone.projectiles).toHaveLength(0);
  });
});
