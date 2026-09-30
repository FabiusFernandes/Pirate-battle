import type { Page, Request } from '@playwright/test';
import type { MatchRecordInput } from '../../src/api/contracts';
import { expect, test } from './fixtures';
import { advance, startMatch } from './helpers';

// Simulated HTTP failures make the browser log "Failed to load resource" — expected here.
test.beforeEach(({ consoleGuard }) => {
  consoleGuard.allow(/Failed to load resource/);
});

interface OpenOptions {
  scenario?: string;
  apiTimeout?: number;
  /** Mock latency for "normal" scenarios; 0 keeps tests fast and deterministic. */
  latency?: number;
}

function appUrl({ scenario = 'success', apiTimeout, latency = 0 }: OpenOptions = {}): string {
  const params = new URLSearchParams({ e2e: '', seed: '3', scenario, mockLatency: String(latency) });
  if (apiTimeout) params.set('apiTimeout', String(apiTimeout));
  return `/?${params.toString().replace('e2e=', 'e2e')}`;
}

async function open(page: Page, options: OpenOptions = {}): Promise<void> {
  await page.goto(appUrl(options));
  await expect(page.getByTestId('menu-play')).toBeVisible();
}

/** Plays a 60 s match to the end (no enemies) and returns its matchId. */
async function playShortMatch(page: Page): Promise<string> {
  await startMatch(page, { fromMenu: true, overrides: { match: { duration: 60 }, spawn: { initialDelay: 1e6 } } });
  const ended = await advance(page, 61_000);
  expect(ended.status).toBe('ended');
  await expect(page.getByTestId('result-dialog')).toBeVisible();
  return ended.matchId;
}

function countRequests(page: Page, method: string, path: RegExp): { count: () => number } {
  let n = 0;
  page.on('request', (request: Request) => {
    if (request.method() === method && path.test(new URL(request.url()).pathname)) n += 1;
  });
  return { count: () => n };
}

async function setScenario(page: Page, id: string): Promise<void> {
  await page.evaluate((s) => window.__pirateMocks?.setScenario(s), id);
}

async function registrationStatus(page: Page): Promise<string | null> {
  return page.getByTestId('registration-status').getAttribute('data-status');
}

test.describe('ranking and match history', () => {
  test('ranking is paginated, ordered by score and filtered by setup', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-tab-ranking')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('ranking-row')).toHaveCount(5);
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 3');

    const points = async () => (await page.locator('[data-testid="ranking-row"] .log-points').allTextContents()).map(Number);
    const first = await points();
    expect([...first].sort((a, b) => b - a)).toEqual(first);
    await expect(page.getByTestId('ranking-row').first().locator('.log-rank')).toHaveText('01');

    await page.getByTestId('page-next').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 2 of 3');
    await expect(page.getByTestId('ranking-row').first().locator('.log-rank')).toHaveText('06');
    const second = await points();
    expect(Math.max(...second)).toBeLessThanOrEqual(Math.min(...first));
    await page.getByTestId('page-prev').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 3');

    await page.getByTestId('ranking-session').selectOption('60');
    await expect(page.getByText('60 second battles · 3 second spawn interval')).toBeVisible();
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 2');
  });

  test('loading state is visible on a slow network', async ({ page }) => {
    await open(page, { scenario: 'slow' });
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-loading')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Loading ranking' })).toHaveCount(1);
    await expect(page.getByTestId('ranking-table')).toBeVisible({ timeout: 6000 });
    await expect(page.getByTestId('log-loading')).toHaveCount(0);
  });

  test('empty lists show an empty state in both tabs', async ({ page }) => {
    await open(page, { scenario: 'empty' });
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-empty')).toContainText('No battles recorded');
    await page.getByTestId('log-tab-history').click();
    await expect(page.getByTestId('log-empty')).toContainText('No recorded battles yet');
  });

  test('ranking failure shows an accessible error; history keeps working; retry recovers', async ({ page }) => {
    const rankingCalls = countRequests(page, 'GET', /\/api\/ranking$/);
    await open(page, { scenario: 'ranking-down' });
    await page.getByTestId('menu-ranking').click();
    const error = page.getByTestId('log-error');
    await expect(error.getByRole('alert')).toContainText('Could not load the ranking');
    await expect(error.getByRole('alert')).toContainText('503');
    // 5xx is transient: initial request + 2 retries.
    expect(rankingCalls.count()).toBe(3);

    await page.getByTestId('log-tab-history').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();

    await page.getByTestId('log-tab-ranking').click();
    await expect(page.getByTestId('log-error')).toBeVisible();
    await setScenario(page, 'success');
    await page.getByTestId('log-retry').click();
    await expect(page.getByTestId('ranking-table')).toBeVisible();
  });

  test('client errors (4xx) are not retried; history failure is reported', async ({ page }) => {
    const rankingCalls = countRequests(page, 'GET', /\/api\/ranking$/);
    await open(page, { scenario: 'bad-request' });
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-error').getByRole('alert')).toContainText('400');
    expect(rankingCalls.count()).toBe(1);

    await setScenario(page, 'history-down');
    await page.getByTestId('log-tab-history').click();
    await expect(page.getByTestId('log-error').getByRole('alert')).toContainText('Could not load the match history');
  });

  test('timeouts and connection failures are handled without blocking the game', async ({ page }) => {
    await open(page, { scenario: 'timeout', apiTimeout: 400 });
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-error').getByRole('alert')).toContainText('took too long', { timeout: 10_000 });

    await setScenario(page, 'offline');
    await page.getByTestId('log-tab-history').click();
    await expect(page.getByTestId('log-error').getByRole('alert')).toContainText('Could not reach the server', { timeout: 10_000 });

    // The game and the options stay fully usable.
    await page.getByTestId('log-back').click();
    await page.getByTestId('menu-options').click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    await page.getByTestId('options-back').click();
    const s = await startMatch(page, { fromMenu: true });
    expect(s.status).toBe('running');
  });

  test('history is paginated newest first', async ({ page }) => {
    await open(page);
    const playerId = await page.evaluate(() => (JSON.parse(localStorage.getItem('pirate-battle:profile') ?? '{}') as { id: string }).id);
    const records: MatchRecordInput[] = Array.from({ length: 7 }, (_, i) => ({
      matchId: `11111111-0000-4000-8000-00000000000${i}`,
      playerId,
      playerName: 'Captain Jack',
      score: i,
      duration: 60,
      reason: 'time_up',
      setup: { sessionTime: 60, spawnInterval: 3 },
      seed: i,
      endedAt: new Date(Date.UTC(2026, 8, 20, 10, i)).toISOString(),
    }));
    await page.evaluate((r) => window.__pirateMocks?.insert(r), records);
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(5);
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 2');
    await expect(page.getByTestId('history-row').first().locator('.log-points')).toHaveText('6');
    await page.getByTestId('page-next').click();
    await expect(page.getByTestId('history-row')).toHaveCount(2);
    await expect(page.getByTestId('history-row').last().locator('.log-points')).toHaveText('0');
  });
});

test.describe('match registration', () => {
  test('a finished match is registered once and appears in both tabs', async ({ page }) => {
    const posts = countRequests(page, 'POST', /\/api\/matches$/);
    await open(page);
    // Visit history first so it is cached as empty; it must refresh after the registration.
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();
    await page.getByTestId('log-back').click();

    await playShortMatch(page);
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-status', 'confirmed');
    await expect(page.getByTestId('registration-status')).toContainText("Recorded in the Captain's Log.");
    await page.getByTestId('result-menu').click();

    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row').first()).toContainText('Time up');
    await expect(page.getByTestId('history-row').first()).toContainText('60 s / 3 s');

    await page.getByTestId('log-tab-ranking').click();
    await page.getByTestId('ranking-session').selectOption('60');
    // Find our entry: it carries the "You" badge (rank depends on the fixtures).
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 2');
    await page.getByTestId('page-next').click();
    await expect(page.locator('.log-row--mine')).toHaveCount(1);
    await expect(page.locator('.log-row--mine')).toContainText('You');
    expect(posts.count()).toBe(1);
  });

  test('pending registration survives a refresh and is sent after the API recovers', async ({ page }) => {
    await open(page, { scenario: 'register-unavailable' });
    const matchId = await playShortMatch(page);
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-status', 'failed', { timeout: 10_000 });
    await expect(page.getByTestId('registration-status')).toContainText('Not recorded yet');

    // Another battle can start while the registration is pending.
    await page.getByTestId('result-play-again').click();
    await page.waitForFunction((id) => window.__pirate?.state()?.matchId !== id && window.__pirate?.isReady() === true, matchId);
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-exit').click();

    await page.reload();
    await page.getByTestId('menu-history').click();
    const pending = page.getByTestId('pending-row');
    await expect(pending).toHaveCount(1);
    await expect(pending).toHaveAttribute('data-status', 'failed', { timeout: 10_000 });
    const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pirate-battle:registrations') ?? '{}') as object));
    expect(stored).toEqual([matchId]);

    // Recovery: switching the API back to Success resends pending registrations.
    await page.getByTestId('open-network').click();
    await page.getByTestId('scenario-success').click();
    await page.getByTestId('network-close').click();
    await expect(page.getByTestId('pending-row')).toHaveCount(0);
    await expect(page.getByTestId('history-row')).toHaveCount(1);
  });

  test('a lost response is recovered by resending, without duplicates', async ({ page }) => {
    const posts = countRequests(page, 'POST', /\/api\/matches$/);
    await open(page, { scenario: 'register-timeout-after-commit', apiTimeout: 600 });
    await playShortMatch(page);
    await expect(page.getByTestId('registration-status')).toHaveAttribute('data-status', 'confirmed', { timeout: 10_000 });
    await expect(page.getByTestId('registration-status')).toContainText('recovered after a lost response');
    // First POST stored the record but timed out; the retry got the existing record back.
    expect(posts.count()).toBe(2);

    await page.getByTestId('result-menu').click();
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('pending-row')).toHaveCount(0);
  });

  test('repeated retry clicks send a single request', async ({ page }) => {
    const posts = countRequests(page, 'POST', /\/api\/matches$/);
    await open(page, { scenario: 'bad-request' });
    await playShortMatch(page);
    const status = page.getByTestId('registration-status');
    await expect(status).toHaveAttribute('data-status', 'failed');
    expect(posts.count()).toBe(1); // 4xx: no automatic retry

    await setScenario(page, 'slow');
    // Five synchronous clicks before React can even re-render.
    await page.getByTestId('registration-retry').evaluate((button) => {
      for (let i = 0; i < 5; i++) (button as HTMLButtonElement).click();
    });
    await expect(status).toHaveAttribute('data-status', 'confirmed', { timeout: 8000 });
    expect(posts.count()).toBe(2);
    expect(await registrationStatus(page)).toBe('confirmed');
  });

  test('abandoned matches are never registered', async ({ page }) => {
    const posts = countRequests(page, 'POST', /\/api\/matches$/);
    await open(page);
    await startMatch(page, { fromMenu: true });
    await advance(page, 5000);
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-exit').click();
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();
    expect(posts.count()).toBe(0);
  });
});

test.describe('network conditions', () => {
  test('a late response for an old setup never replaces the current one', async ({ page }) => {
    // Odd requests take 2.5 s, even ones 150 ms.
    await open(page, { scenario: 'out-of-order' });
    await page.getByTestId('menu-ranking').click();
    // Request 1 (120 s setup, slow) is still in flight when the setup changes.
    await expect(page.getByTestId('log-loading')).toBeVisible();
    await page.getByTestId('ranking-session').selectOption('60');
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 2');
    await page.waitForTimeout(3000);
    await expect(page.getByText('60 second battles · 3 second spawn interval')).toBeVisible();
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 2');
  });

  test('scenario selection persists and reset restores the initial state', async ({ page }) => {
    await open(page);
    await page.getByTestId('open-network').click();
    const panel = page.getByTestId('network-panel');
    await expect(panel.getByRole('radio', { name: /^Success/ })).toBeChecked();
    await panel.getByTestId('scenario-empty').click();
    await page.getByTestId('network-close').click();
    // Reload without ?scenario (which would take precedence): the choice was persisted.
    await page.goto('/?e2e&mockLatency=0');
    expect(await page.evaluate(() => window.__pirateMocks?.scenario())).toBe('empty');

    await page.getByTestId('open-network').click();
    await page.getByTestId('mock-reset').click();
    await expect(page.getByTestId('network-status')).toContainText('Mock server reset');
    await expect(page.getByTestId('network-panel').getByRole('radio', { name: /^Success/ })).toBeChecked();
    await page.getByTestId('network-close').click();
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 3');
  });

  test('re-displaying a tab refreshes it in the background', async ({ page }) => {
    const rankingCalls = countRequests(page, 'GET', /\/api\/ranking$/);
    await open(page);
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('ranking-table')).toBeVisible();
    const before = rankingCalls.count();
    await page.getByTestId('log-tab-history').click();
    await page.getByTestId('log-tab-ranking').click();
    // Cached data is shown immediately while it refreshes.
    await expect(page.getByTestId('ranking-table')).toBeVisible();
    await expect.poll(() => rankingCalls.count()).toBe(before + 1);
  });
});
