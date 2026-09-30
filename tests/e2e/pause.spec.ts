import { expect, test } from './fixtures';
import { NO_SPAWNS, advance, holdKeys, startMatch, state } from './helpers';

test.describe('pause', () => {
  test('manual pause suspends time, cooldowns and simulation', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    const fired = await holdKeys(page, ['KeyQ'], 100);
    const cooldown = fired.player.cooldowns.left;
    expect(cooldown).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    const dialog = page.getByTestId('pause-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('pause-resume')).toBeFocused();
    await expect(page.getByTestId('status-state')).toHaveText('paused');

    const paused = await advance(page, 5000);
    expect(paused.session).toBe('paused');
    expect(paused.elapsed).toBe(fired.elapsed);
    expect(paused.steps).toBe(fired.steps);
    expect(paused.player.cooldowns.left).toBe(cooldown);
    expect(paused.projectiles.map((p) => [p.x, p.y])).toEqual(fired.projectiles.map((p) => [p.x, p.y]));

    // Game keys are not captured while paused: Space activates the focused Resume button.
    await page.keyboard.press('Space');
    await expect(dialog).toHaveCount(0);
    const resumed = await advance(page, 1000);
    expect(resumed.session).toBe('running');
    expect(resumed.elapsed).toBeCloseTo(fired.elapsed + 1, 6);
    expect(resumed.stats.playerShots.front).toBe(0);
  });

  test('pauses automatically on blur and does not carry held input over', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await page.keyboard.down('KeyW');
    const moving = await advance(page, 1000);
    expect(moving.player.speed).toBeGreaterThan(100);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByTestId('pause-dialog')).toContainText('lost focus');
    const paused = await state(page);
    expect(paused.pauseReason).toBe('blur');

    // Game keys pressed during the pause are ignored.
    await page.keyboard.press('KeyQ');
    await page.keyboard.press('KeyE');
    await page.getByTestId('pause-resume').click();

    // W is physically still down, but it was released by the pause and auto-repeat is ignored:
    // the ship coasts to a stop instead of accelerating.
    const after = await advance(page, 1500);
    expect(after.player.speed).toBe(0);
    expect(after.stats.playerShots).toEqual({ front: 0, left: 0, right: 0 });
    expect(after.elapsed).toBeCloseTo(moving.elapsed + 1.5, 6);
    await page.keyboard.up('KeyW');
  });

  test('pauses automatically when the tab is hidden', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('pause-dialog')).toContainText('tab was hidden');
    expect((await state(page)).pauseReason).toBe('hidden');
  });

  test('real-time clock stops advancing while paused', async ({ page }) => {
    await startMatch(page, { realtime: true, overrides: NO_SPAWNS });
    await page.waitForFunction(() => (window.__pirate?.state()?.elapsed ?? 0) > 0.5);
    await page.getByTestId('hud-pause').click();
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    const atPause = await state(page);
    await page.waitForTimeout(1500);
    const stillPaused = await state(page);
    expect(stillPaused.elapsed).toBe(atPause.elapsed);

    await page.getByTestId('pause-resume').click();
    await page.waitForFunction((t) => (window.__pirate?.state()?.elapsed ?? 0) > t + 0.3, atPause.elapsed);
    const resumed = await state(page);
    // No jump: the 1.5 s spent paused never reaches the simulation.
    expect(resumed.elapsed - atPause.elapsed).toBeLessThan(1);
  });
});
