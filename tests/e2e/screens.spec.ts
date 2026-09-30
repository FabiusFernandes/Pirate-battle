import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { DUMMY_ENEMIES, NO_SPAWNS, advance, holdKeys, merge, setPlayerPose, spawnEnemy, startMatch } from './helpers';

async function expectNoA11yViolations(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary).toEqual([]);
}

test.describe('result screen', () => {
  test('shows the result and restores it after a refresh', async ({ page }) => {
    await startMatch(page, { seed: 8, overrides: merge(NO_SPAWNS, DUMMY_ENEMIES, { match: { duration: 60 } }) });
    await setPlayerPose(page, 400, 450, 0);
    await spawnEnemy(page, 'chaser', 700, 450, 180);
    const sunk = await holdKeys(page, ['Space'], 1500);
    expect(sunk.score).toBe(1);
    const ended = await advance(page, 60_000);
    expect(ended.status).toBe('ended');

    const dialog = page.getByTestId('result-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('result-score')).toHaveText(String(ended.score));
    await expect(dialog.getByTestId('result-reason')).toHaveText('Time up');
    await expect(dialog.getByTestId('result-duration')).toHaveText('01:00');
    await expectNoA11yViolations(page, '[data-testid="result-dialog"]');

    await page.reload();
    const screen = page.getByTestId('result-screen');
    await expect(screen).toBeVisible();
    await expect(screen.getByTestId('result-score')).toHaveText(String(ended.score));
    await expect(screen.getByTestId('result-reason')).toHaveText('Time up');
    await expect(screen.getByTestId('result-duration')).toHaveText('01:00');
    await expect(screen.getByTestId('result-play-again')).toBeFocused();

    await screen.getByTestId('result-menu').click();
    await expect(page.getByTestId('menu-last-result')).toContainText(`${ended.score}`);
    // Back on the menu, a refresh stays on the menu.
    await page.reload();
    await expect(page.getByTestId('menu-play')).toBeVisible();
  });

  test('refreshing during a battle abandons it without recording a result', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await advance(page, 5000);
    await page.reload();
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page.getByTestId('menu-last-result')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('pirate-battle:last-result'))).toBeNull();
  });
});

test.describe('accessibility', () => {
  test('menus are keyboard operable with visible focus', async ({ page }) => {
    await page.goto('/');
    const play = page.getByTestId('menu-play');
    await expect(play).toBeFocused();
    await page.keyboard.press('Tab');
    const options = page.getByTestId('menu-options');
    await expect(options).toBeFocused();
    expect(await options.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Captain name')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Decrease game session time')).toBeFocused();
  });

  test('dialogs trap focus, close with Escape and restore focus', async ({ page }) => {
    await page.goto('/');
    const help = page.getByTestId('menu-howto');
    await help.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByTestId('howto-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('howto-close')).toBeFocused();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(help).toBeFocused();
  });

  test('screens and dialogs have no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/?e2e');
    await expectNoA11yViolations(page);

    await page.getByTestId('menu-howto').click();
    await expectNoA11yViolations(page, '[data-testid="howto-dialog"]');
    await page.getByTestId('howto-close').click();

    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('ranking-table')).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByTestId('log-tab-history').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByTestId('open-network').click();
    await expectNoA11yViolations(page, '[data-testid="network-panel"]');
    await page.getByTestId('network-close').click();
    await page.getByTestId('log-back').click();

    await page.getByTestId('menu-options').click();
    await page.getByLabel('Game session time', { exact: true }).fill('5');
    await expectNoA11yViolations(page);
    await page.getByTestId('options-back').click();

    await startMatch(page, { fromMenu: true, overrides: NO_SPAWNS });
    await expectNoA11yViolations(page);
    await page.keyboard.press('Escape');
    await expectNoA11yViolations(page, '[data-testid="pause-dialog"]');
    await page.getByTestId('pause-options').click();
    await expectNoA11yViolations(page, '[data-testid="pause-dialog"]');
  });

  test('match state is exposed semantically without per-frame announcements', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    const status = page.getByTestId('match-status');
    await expect(status.getByTestId('status-score')).toHaveText('0');
    await expect(status.getByTestId('status-time')).toHaveText('2 minutes');
    await advance(page, 3000);
    await expect(status.getByTestId('status-time')).toHaveText('1 minute 57 seconds');
    // The live region stays quiet for plain time ticks.
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('status').filter({ hasText: 'Game paused.' })).toHaveCount(1);
  });
});

test.describe('orientation', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch devices only');

  test('portrait pauses the battle and asks to rotate; landscape offers resume', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(page.getByTestId('rotate-overlay')).toBeVisible();
    const paused = await advance(page, 2000);
    expect(paused.session).toBe('paused');
    expect(paused.pauseReason).toBe('orientation');

    await page.setViewportSize({ width: 915, height: 412 });
    await expect(page.getByTestId('rotate-overlay')).toHaveCount(0);
    await expect(page.getByTestId('pause-dialog')).toContainText('portrait');
    await page.getByTestId('pause-resume').click();
    const resumed = await advance(page, 1000);
    expect(resumed.session).toBe('running');
    expect(resumed.elapsed).toBeCloseTo(paused.elapsed + 1, 6);

    // The arena keeps its proportions after the size change.
    const canvas = await page.locator('canvas').boundingBox();
    expect(canvas?.width).toBeCloseTo(915, 0);
  });
});
