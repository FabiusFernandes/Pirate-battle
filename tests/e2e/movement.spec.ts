import { ARENA_MAP } from '../../src/game/world/arenaMap';
import { buildArenaGeometry, circlePenetration } from '../../src/game/world/obstacles';
import { expect, test } from './fixtures';
import { DUMMY_ENEMIES, NO_SPAWNS, advance, headingDeg, holdKeys, merge, setPlayerPose, spawnEnemy, startMatch } from './helpers';

const geometry = buildArenaGeometry(ARENA_MAP);

test.describe('player movement', () => {
  test('match starts with full health, zero score and the configured time', async ({ page }) => {
    const s = await startMatch(page, { overrides: NO_SPAWNS });
    expect(s.status).toBe('running');
    expect(s.player.health).toBe(100);
    expect(s.score).toBe(0);
    expect(s.remaining).toBe(120);
    await expect(page.getByTestId('status-time')).toHaveText('2 minutes');
    await expect(page.getByTestId('status-health')).toHaveText('100 of 100');
  });

  test('sails forward along its heading and rotates both ways', async ({ page }) => {
    const start = await startMatch(page, { overrides: NO_SPAWNS });
    expect(headingDeg(start.player)).toBeCloseTo(-90, 3);

    const forward = await holdKeys(page, ['KeyW'], 1000);
    expect(forward.player.x).toBeCloseTo(start.player.x, 3);
    const travelled = start.player.y - forward.player.y;
    expect(travelled).toBeGreaterThan(100);
    expect(travelled).toBeLessThan(120);

    // Stops when thrust is released (deceleration), without drifting sideways.
    const coasted = await advance(page, 2000);
    expect(coasted.player.speed).toBe(0);

    const right = await holdKeys(page, ['KeyD'], 1000);
    expect(headingDeg(right.player)).toBeCloseTo(-90 + 150, 1);
    const left = await holdKeys(page, ['ArrowLeft'], 1000);
    expect(headingDeg(left.player)).toBeCloseTo(-90, 1);
    // Turning in place does not move the ship.
    expect(left.player.x).toBeCloseTo(coasted.player.x, 3);
    expect(left.player.y).toBeCloseTo(coasted.player.y, 3);
  });

  test('movement is frame-rate independent (same result in one or many advances)', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    const single = await advance(page, 1500);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');

    await startMatch(page, { overrides: NO_SPAWNS });
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    let chunked = await advance(page, 100);
    for (let i = 0; i < 14; i++) chunked = await advance(page, 100);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');

    expect(chunked.player.x).toBeCloseTo(single.player.x, 6);
    expect(chunked.player.y).toBeCloseTo(single.player.y, 6);
    expect(chunked.player.heading).toBeCloseTo(single.player.heading, 6);
  });

  test('stays inside the visible arena', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await setPlayerPose(page, 120, 450, 180);
    const west = await holdKeys(page, ['KeyW'], 2000);
    expect(west.player.x).toBeCloseTo(west.player.radius, 3);
    expect(west.player.y).toBeCloseTo(450, 3);

    await setPlayerPose(page, 800, 120, -90);
    const north = await holdKeys(page, ['KeyW'], 2000);
    expect(north.player.y).toBeCloseTo(north.player.radius, 3);

    // Diagonal into a corner: slides along the bottom edge until it is stuck in the corner.
    await setPlayerPose(page, 1480, 800, 45);
    const corner = await holdKeys(page, ['KeyW'], 4000);
    expect(corner.player.x).toBeCloseTo(1600 - corner.player.radius, 3);
    expect(corner.player.y).toBeCloseTo(896 - corner.player.radius, 3);
  });

  test('cannot sail through islands and slides along the coast', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    // Sand island at tiles (17..19, 1..3): its west face is at x = 1096.
    await setPlayerPose(page, 960, 160, 0);
    const blocked = await holdKeys(page, ['KeyW'], 2500);
    expect(blocked.player.x).toBeLessThanOrEqual(1096 - blocked.player.radius + 0.01);
    expect(blocked.player.x).toBeGreaterThan(1096 - blocked.player.radius - 2);
    expect(blocked.player.y).toBeCloseTo(160, 3);

    // Approaching at an angle: the ship slides along the coast instead of stopping dead.
    await setPlayerPose(page, 960, 120, 30);
    let s = await advance(page, 0);
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 25; i++) {
      s = await advance(page, 100);
      for (const obstacle of geometry.obstacles) {
        const hit = circlePenetration(obstacle, s.player.x, s.player.y, s.player.radius);
        expect(hit?.depth ?? 0).toBeLessThan(0.5);
      }
    }
    await page.keyboard.up('KeyW');
    // Hit the west face, then slid south along it (at a reduced speed) instead of stopping.
    expect(s.player.x).toBeCloseTo(1096 - s.player.radius, 0);
    expect(s.player.y).toBeGreaterThan(190);
  });

  test('islands block projectiles', async ({ page }) => {
    await startMatch(page, { overrides: merge(NO_SPAWNS, DUMMY_ENEMIES) });
    await setPlayerPose(page, 960, 160, 0);
    // Target hidden behind the island.
    await spawnEnemy(page, 'chaser', 1380, 160, 180);
    const fired = await holdKeys(page, ['Space'], 50);
    expect(fired.stats.playerShots.front).toBe(1);
    const after = await advance(page, 1500);
    expect(after.projectiles).toHaveLength(0);
    expect(after.enemies[0]?.health).toBe(50);
    expect(after.stats.hitsOnEnemies).toBe(0);
  });
});
