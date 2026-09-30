import { expect, test } from './fixtures';
import { advance, startMatch, state } from './helpers';

test.describe('options', () => {
  test('navigate, validate, save and persist after refresh', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-options').click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeFocused();

    const session = page.getByLabel('Game session time', { exact: true });
    const spawn = page.getByLabel('Enemy spawn time', { exact: true });
    await expect(session).toHaveValue('120');
    await expect(spawn).toHaveValue('3');
    const save = page.getByTestId('options-save');
    await expect(save).toBeDisabled(); // nothing changed yet

    // Out of range and off-step values are rejected with accessible messages.
    await session.fill('45');
    await expect(page.getByTestId('sessionTime-error')).toHaveText('Must be between 60 and 180 seconds.');
    await expect(session).toHaveAttribute('aria-invalid', 'true');
    await expect(save).toBeDisabled();
    await session.fill('125');
    await expect(page.getByTestId('sessionTime-error')).toHaveText('Use steps of 10 seconds.');
    await spawn.fill('0');
    await expect(page.getByTestId('spawnInterval-error')).toHaveText('Must be greater than zero.');
    await spawn.fill('');
    await expect(page.getByTestId('spawnInterval-error')).toHaveText('Enter a value.');

    // Steppers snap to the grid and clamp to the limits.
    await session.fill('170');
    await page.getByTestId('sessionTime-increase').click();
    await expect(session).toHaveValue('180');
    await expect(page.getByTestId('sessionTime-increase')).toBeDisabled();
    await spawn.fill('1.5');
    await page.getByTestId('spawnInterval-decrease').click();
    await expect(spawn).toHaveValue('1');
    await page.getByTestId('spawnInterval-increase').click();
    await expect(spawn).toHaveValue('1.5');

    await save.click();
    await expect(page.getByTestId('options-status')).toHaveText(/Options saved/);
    await expect(save).toBeDisabled();

    await page.reload();
    // A refresh on the options screen stays there, with the saved values.
    await expect(page.getByLabel('Game session time', { exact: true })).toHaveValue('180');
    await expect(page.getByLabel('Enemy spawn time', { exact: true })).toHaveValue('1.5');

    await page.getByTestId('options-reset').click();
    await expect(page.getByLabel('Game session time', { exact: true })).toHaveValue('120');
    await page.getByTestId('options-back').click();
    await page.getByTestId('menu-options').click();
    // Leaving without saving discards the draft.
    await expect(page.getByLabel('Game session time', { exact: true })).toHaveValue('180');
  });

  test('a match uses the saved options; changes during a match apply to the next one', async ({ page }) => {
    await page.goto('/?e2e&seed=4');
    await page.getByTestId('menu-options').click();
    await page.getByLabel('Game session time', { exact: true }).fill('60');
    await page.getByLabel('Enemy spawn time', { exact: true }).fill('2');
    await page.getByTestId('options-save').click();
    await page.getByTestId('options-back').click();

    const first = await startMatch(page, { fromMenu: true });
    expect(first.duration).toBe(60);
    expect(first.spawnInterval).toBe(2);
    expect(first.remaining).toBe(60);

    // Change options from the pause menu.
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-options').click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeFocused();
    await page.getByLabel('Game session time', { exact: true }).fill('90');
    await page.getByTestId('options-save').click();
    await expect(page.getByTestId('options-status')).toHaveText(/next battle/);
    await page.getByTestId('pause-options-back').click();
    await page.getByTestId('pause-resume').click();

    const current = await advance(page, 1000);
    expect(current.duration).toBe(60);

    const s = await advance(page, 60_000);
    expect(s.status).toBe('ended');
    await page.getByTestId('result-play-again').click();
    await page.waitForFunction((id) => window.__pirate?.state()?.matchId !== id && window.__pirate?.isReady() === true, s.matchId);
    const next = await state(page);
    expect(next.duration).toBe(90);
    expect(next.spawnInterval).toBe(2);
  });

  test('corrupted stored options fall back to defaults', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('pirate-battle:options', '{"sessionTime": 9999, "spawnInterval": "abc"}');
    });
    await page.reload();
    await page.getByTestId('menu-options').click();
    await expect(page.getByLabel('Game session time', { exact: true })).toHaveValue('120');
    await expect(page.getByLabel('Enemy spawn time', { exact: true })).toHaveValue('3');
  });
});
