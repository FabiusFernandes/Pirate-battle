import { expect, test } from './fixtures';
import { NO_SPAWNS, advance, holdKeys, merge, spawnEnemy, startMatch, state } from './helpers';

test.describe('match lifecycle', () => {
  test('ends when time runs out and freezes the simulation', async ({ page }) => {
    await startMatch(page, { overrides: merge(NO_SPAWNS, { match: { duration: 60 } }) });
    const almost = await advance(page, 59_000);
    expect(almost.status).toBe('running');
    expect(almost.remaining).toBeCloseTo(1, 3);

    const ended = await advance(page, 2000);
    expect(ended.status).toBe('ended');
    expect(ended.endReason).toBe('time_up');
    expect(ended.elapsed).toBeCloseTo(60, 6);

    const dialog = page.getByTestId('result-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('result-reason')).toHaveText('Time up');
    await expect(dialog.getByTestId('result-duration')).toHaveText('01:00');
    await expect(dialog.getByTestId('result-play-again')).toBeFocused();

    // Input and time no longer affect anything.
    const frozen = await holdKeys(page, ['KeyW', 'Space'], 2000);
    expect(frozen.player.x).toBe(ended.player.x);
    expect(frozen.player.y).toBe(ended.player.y);
    expect(frozen.steps).toBe(ended.steps);
    expect(frozen.projectiles).toHaveLength(0);
  });

  test('ends when the player is destroyed; spawns, damage and scoring stop', async ({ page }) => {
    await startMatch(page, {
      overrides: { chaser: { contactDamage: 100 }, spawn: { initialDelay: 0.5, interval: 0.5, minDistanceFromPlayer: 200 } },
    });
    await spawnEnemy(page, 'chaser', 700, 470, 0);
    let s = await advance(page, 0);
    for (let i = 0; i < 30 && s.status === 'running'; i++) s = await advance(page, 100);
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('destroyed');
    expect(s.player.health).toBe(0);
    expect(s.score).toBe(0);
    await expect(page.getByTestId('result-reason')).toHaveText('Ship destroyed');

    const later = await advance(page, 5000);
    expect(later.spawnCount).toBe(s.spawnCount);
    expect(later.elapsed).toBe(s.elapsed);
    expect(later.enemies.map((e) => [e.x, e.y])).toEqual(s.enemies.map((e) => [e.x, e.y]));
  });

  test('play again starts a clean new match', async ({ page }) => {
    await startMatch(page, { overrides: merge(NO_SPAWNS, { match: { duration: 60 } }) });
    await spawnEnemy(page, 'shooter', 300, 470, 0);
    await holdKeys(page, ['KeyW', 'Space'], 3000);
    const first = await advance(page, 60_000);
    expect(first.status).toBe('ended');

    await page.getByTestId('result-play-again').click();
    await page.waitForFunction((id) => {
      const s = window.__pirate?.state();
      return s !== null && s !== undefined && s.matchId !== id && window.__pirate?.isReady() === true;
    }, first.matchId);
    const fresh = await state(page);
    expect(fresh.status).toBe('running');
    expect(fresh.elapsed).toBe(0);
    expect(fresh.remaining).toBe(60);
    expect(fresh.score).toBe(0);
    expect(fresh.player.health).toBe(100);
    expect(fresh.player.x).toBe(800);
    expect(fresh.player.y).toBe(470);
    expect(fresh.enemies).toHaveLength(0);
    expect(fresh.projectiles).toHaveLength(0);
    expect(fresh.stats.projectilesFired).toBe(0);
    await expect(page.getByTestId('result-dialog')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1);
  });
});
