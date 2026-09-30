import { expect, test } from './fixtures';
import { NO_SPAWNS, advance, holdKeys, startMatch, state } from './helpers';

/**
 * Lifecycle of the PixiJS host. This file also runs in the `desktop-dev-strict-mode` project
 * against the Vite dev server, where React Strict Mode double-invokes effects: the host must
 * survive mount → unmount → mount with exactly one canvas and no errors.
 */
test.describe('lifecycle and resources', () => {
  test('one canvas per match; repeated play/exit cycles do not accumulate display objects', async ({ page }) => {
    await page.goto('/?e2e&seed=21&mockLatency=0');
    const counts: number[] = [];
    for (let cycle = 0; cycle < 5; cycle++) {
      await startMatch(page, { fromMenu: true, overrides: NO_SPAWNS });
      await expect(page.locator('canvas')).toHaveCount(1);
      counts.push((await state(page)).renderables);
      // Fire every weapon so projectiles, pooled sprites and effects get created.
      await holdKeys(page, ['KeyW', 'Space', 'KeyQ', 'KeyE'], 1500);
      await advance(page, 3000);
      await page.keyboard.press('Escape');
      await page.getByTestId('pause-exit').click();
      await expect(page.locator('canvas')).toHaveCount(0);
    }
    // Every fresh match starts with the same number of display objects.
    expect(new Set(counts).size).toBe(1);
  });

  test('play again replaces the canvas instead of adding one', async ({ page }) => {
    await startMatch(page, { overrides: { ...NO_SPAWNS, match: { duration: 60 } } });
    const first = await advance(page, 61_000);
    await page.getByTestId('result-play-again').click();
    await page.waitForFunction((id) => window.__pirate?.state()?.matchId !== id && window.__pirate?.isReady() === true, first.matchId);
    await expect(page.locator('canvas')).toHaveCount(1);
    const second = await state(page);
    expect(second.renderables).toBeLessThanOrEqual(first.renderables);
  });

  test('canvas follows the pixel density and keeps the arena proportions on resize', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    const check = async () => {
      const info = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const api = window.__pirate;
        if (!canvas || !api) return null;
        const topLeft = api.worldToClient(0, 0);
        const bottomRight = api.worldToClient(1600, 896);
        return {
          dpr: window.devicePixelRatio,
          pixelWidth: canvas.width,
          cssWidth: canvas.getBoundingClientRect().width,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          topLeft,
          bottomRight,
        };
      });
      expect(info).not.toBeNull();
      const i = info!;
      // Backing store = CSS size × device pixel ratio (capped at 2).
      expect(i.pixelWidth).toBe(Math.round(i.cssWidth * Math.min(i.dpr, 2)));
      const w = i.bottomRight!.x - i.topLeft!.x;
      const h = i.bottomRight!.y - i.topLeft!.y;
      expect(w / h).toBeCloseTo(1600 / 896, 2);
      // Letterboxed: the whole arena is on screen.
      expect(i.topLeft!.x).toBeGreaterThanOrEqual(-0.5);
      expect(i.topLeft!.y).toBeGreaterThanOrEqual(-0.5);
      expect(i.bottomRight!.x).toBeLessThanOrEqual(i.viewportWidth + 0.5);
      expect(i.bottomRight!.y).toBeLessThanOrEqual(i.viewportHeight + 0.5);
    };
    await check();
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: Math.round(size.width * 0.7), height: size.height });
    await expect.poll(async () => (await page.locator('canvas').boundingBox())?.width).toBeCloseTo(Math.round(size.width * 0.7), 0);
    await check();
    // Resizing never changes the rules: the simulation is untouched.
    const s = await state(page);
    expect(s.player.x).toBe(800);
    expect(s.player.y).toBe(470);
  });

  test('a default match spawns both enemy types', async ({ page }) => {
    await startMatch(page, { seed: 5 });
    const s = await advance(page, 5000);
    const kinds = new Set(s.enemies.map((e) => e.kind));
    expect(kinds).toEqual(new Set(['chaser', 'shooter']));
    expect(s.spawnInterval).toBe(3);
  });
});
