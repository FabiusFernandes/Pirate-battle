import type { CDPSession, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { NO_SPAWNS, advance, startMatch, state } from './helpers';

test.describe('navigation and controls', () => {
  test('abandoning a match from the pause menu releases it; repeated navigation stays clean', async ({ page }) => {
    await page.goto('/?e2e&seed=3');
    for (let i = 0; i < 4; i++) {
      await startMatch(page, { fromMenu: true, overrides: NO_SPAWNS });
      await advance(page, 500);
      await page.keyboard.press('Escape');
      await page.getByTestId('pause-exit').click();
      await expect(page.getByTestId('menu-play')).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      expect(await page.evaluate(() => window.__pirate?.state() ?? null)).toBeNull();
    }
    const fresh = await startMatch(page, { fromMenu: true, overrides: NO_SPAWNS });
    expect(fresh.elapsed).toBe(0);
  });

  test('game keys are only captured during gameplay', async ({ page }) => {
    await page.goto('/?e2e');
    // On the menu, Space activates the focused button normally.
    await expect(page.getByTestId('menu-play')).toBeFocused();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__pirate?.isReady() === true);
    expect((await state(page)).status).toBe('running');
  });

  test('touch controls are hidden on desktop pointers', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only');
    await startMatch(page, { overrides: NO_SPAWNS });
    await expect(page.getByTestId('touch-controls')).toBeHidden();
  });
});

test.describe('touch controls', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch devices only');

  async function center(page: Page, testId: string) {
    const box = await page.getByTestId(testId).boundingBox();
    if (!box) throw new Error(`${testId} not visible`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  }

  test('multi-touch: sail and fire at the same time, release stops', async ({ page }) => {
    const start = await startMatch(page, { overrides: NO_SPAWNS });
    await expect(page.getByTestId('touch-controls')).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const forward = await center(page, 'touch-forward');
    const fire = await center(page, 'touch-fireFront');

    await touch(cdp, 'touchStart', [{ ...forward, id: 1 }]);
    await touch(cdp, 'touchStart', [
      { ...forward, id: 1 },
      { ...fire, id: 2 },
    ]);
    const held = await advance(page, 1000);
    expect(held.player.y).toBeLessThan(start.player.y - 90);
    expect(held.stats.playerShots.front).toBe(3);

    // Lift the fire finger only (CDP touchEnd lists the lifted points): still sailing, no more shots.
    await touch(cdp, 'touchEnd', [{ ...fire, id: 2 }]);
    const sailing = await advance(page, 1000);
    expect(sailing.player.speed).toBeGreaterThan(150);
    expect(sailing.stats.playerShots.front).toBe(3);

    await touch(cdp, 'touchEnd', [{ ...forward, id: 1 }]);
    const stopped = await advance(page, 2000);
    expect(stopped.player.speed).toBe(0);
  });

  test('turn buttons rotate the ship', async ({ page }) => {
    const start = await startMatch(page, { overrides: NO_SPAWNS });
    const cdp = await page.context().newCDPSession(page);
    const right = await center(page, 'touch-turnRight');
    await touch(cdp, 'touchStart', [{ ...right, id: 7 }]);
    const turned = await advance(page, 600);
    await touch(cdp, 'touchEnd', [{ ...right, id: 7 }]);
    expect(turned.player.heading - start.player.heading).toBeCloseTo((90 * Math.PI) / 180, 2);
  });
});
