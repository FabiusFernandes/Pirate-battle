import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { DUMMY_ENEMIES, NO_SPAWNS, advance, holdKeys, merge, setPlayerPose, spawnEnemy, startMatch } from './helpers';

/**
 * Visual regression baselines (tests/e2e/__screenshots__/<project>/visual.spec.ts/*.png).
 * Scenes are fully deterministic: fixed seed, manual simulation clock, fixed enemy
 * positions, seeded effects, fixture data with fixed dates, UTC timezone.
 * Update with `npm run test:e2e:update -- visual`.
 */

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  // Two animation frames: the manual-clock host renders on the next frame after a change.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => { resolve(); }))));
}

test.describe('visual regression @visual', () => {
  test('main menu', async ({ page }) => {
    await page.goto('/?mockLatency=0');
    await expect(page.getByTestId('menu-play')).toBeFocused();
    await settled(page);
    await expect(page).toHaveScreenshot('menu.png');
  });

  test('arena in a stable state', async ({ page }) => {
    await startMatch(page, { seed: 11, overrides: merge(NO_SPAWNS, DUMMY_ENEMIES) });
    await setPlayerPose(page, 640, 470, 0);
    await spawnEnemy(page, 'shooter', 960, 470, 180);
    // Offset so only one ball of the broadside hits: damaged (and burning), not sunk.
    await spawnEnemy(page, 'chaser', 694, 250, 90);
    await spawnEnemy(page, 'chaser', 1380, 760, 200);
    // Damage the shooter (front cannon) and the northern chaser (left broadside).
    await holdKeys(page, ['Space'], 20);
    await holdKeys(page, ['KeyQ'], 20);
    await advance(page, 2000);
    await settled(page);
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await startMatch(page, { seed: 12, overrides: merge(NO_SPAWNS, DUMMY_ENEMIES, { match: { duration: 60 } }) });
    await setPlayerPose(page, 400, 450, 0);
    await spawnEnemy(page, 'chaser', 700, 450, 180);
    await holdKeys(page, ['Space'], 1500);
    await advance(page, 60_000);
    const dialog = page.getByTestId('result-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-status', 'confirmed');
    await settled(page);
    await expect(page).toHaveScreenshot('result-dialog.png');

    // The same result restored after a refresh (standalone screen).
    await page.reload();
    await expect(page.getByTestId('result-screen')).toBeVisible();
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-status', 'confirmed');
    await settled(page);
    await expect(page).toHaveScreenshot('result-screen.png');
  });

  test('captain’s log ranking', async ({ page }) => {
    await page.goto('/?mockLatency=0');
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('ranking-row')).toHaveCount(5);
    await expect(page.getByTestId('log-refreshing')).toHaveText('');
    await settled(page);
    await expect(page).toHaveScreenshot('ranking.png');
  });
});
