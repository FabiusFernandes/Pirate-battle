import { expect, test } from './fixtures';

test.describe('asset loading', () => {
  // With the MSW service worker in control, asset requests are fetched by the worker and
  // page.route cannot intercept them. These tests block service workers, which also shows
  // that the game runs without the mock API (only ranking/history would be unavailable).
  test.use({ serviceWorkers: 'block' });

  test('shows progress, then mounts the arena canvas', async ({ page }) => {
    // Slow down the atlas images so the loading state is observable.
    await page.route('**/game/atlas/*.png', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await page.goto('/');
    await page.getByTestId('menu-play').click();

    await expect(page.getByRole('progressbar', { name: 'Loading game assets' })).toBeVisible();
    await expect(page.locator('canvas.game-canvas')).toBeVisible();
    await expect(page.getByTestId('asset-loading')).toHaveCount(0);
  });

  test('reports a failed asset and recovers on retry', async ({ page, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource|ships_sheet/);
    let failing = true;
    await page.route('**/game/atlas/ships_sheet.png', async (route) => {
      if (failing) await route.abort('failed');
      else await route.continue();
    });

    await page.goto('/');
    await page.getByTestId('menu-play').click();

    const alert = page.getByTestId('asset-error').getByRole('alert');
    // Generous timeout: on the dev server Vite compiles modules on first request.
    await expect(alert).toContainText('Could not load game assets', { timeout: 20_000 });
    await expect(page.locator('canvas.game-canvas')).toHaveCount(0);
    await expect(page.getByTestId('asset-retry')).toBeFocused();

    failing = false;
    await page.getByTestId('asset-retry').click();
    await expect(page.locator('canvas.game-canvas')).toBeVisible();
  });

  test('keeps the arena aspect ratio and releases the canvas when leaving', async ({ page }) => {
    await page.goto('/');
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('menu-play').click();
      await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
      await page.getByTestId('hud-pause').click();
      await page.getByTestId('pause-exit').click();
      await expect(page.locator('canvas')).toHaveCount(0);
    }

    await page.getByTestId('menu-play').click();
    const canvas = page.locator('canvas.game-canvas');
    await expect(canvas).toBeVisible();
    const size = page.viewportSize();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    // The canvas fills the stage; the arena inside it is letterboxed by the viewport.
    expect(Math.round(box?.width ?? 0)).toBe(size?.width);
    expect(Math.round(box?.height ?? 0)).toBe(size?.height);
  });
});
