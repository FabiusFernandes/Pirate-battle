import { expect, test } from './fixtures';
import { DUMMY_ENEMIES, NO_SPAWNS, advance, holdKeys, merge, setPlayerPose, spawnEnemy, startMatch, state } from './helpers';

const SCENARIO = merge(NO_SPAWNS, DUMMY_ENEMIES);

test.describe('visual and audio feedback', () => {
  test('shots, hits and kills produce effects that expire and are released', async ({ page }) => {
    await startMatch(page, { overrides: SCENARIO });
    await setPlayerPose(page, 800, 450, 0);
    await spawnEnemy(page, 'chaser', 800, 300, 0);
    const idle = await advance(page, 1000);
    const baseline = idle.effects;

    const fired = await holdKeys(page, ['KeyQ'], 50);
    expect(fired.effects).toBeGreaterThan(baseline);

    const killed = await advance(page, 400);
    expect(killed.score).toBe(1);
    // Explosion, debris, smoke, wreck and the "+1" popup.
    expect(killed.effects).toBeGreaterThan(fired.effects);

    // Every transient effect finishes and its sprite goes back to the pool.
    const settled = await advance(page, 4000);
    expect(settled.effects).toBe(baseline - 1);
  });

  test('effects freeze while paused', async ({ page }) => {
    await startMatch(page, { overrides: SCENARIO });
    await holdKeys(page, ['Space', 'KeyQ', 'KeyE'], 50);
    const before = await state(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    const paused = await advance(page, 3000);
    expect(paused.effects).toBe(before.effects);
  });

  test('damage flashes the screen edges and low health is signalled', async ({ page }) => {
    await startMatch(page, { overrides: merge(NO_SPAWNS, { chaser: { contactDamage: 35 } }) });
    await spawnEnemy(page, 'chaser', 700, 470, 0);
    await advance(page, 1500);
    await expect(page.getByTestId('status-health')).toHaveText('65 of 100');
    await expect(page.getByTestId('damage-flash')).toHaveCount(1);
    await expect(page.getByTestId('low-health')).toHaveCount(0);

    await spawnEnemy(page, 'chaser', 700, 470, 0);
    await advance(page, 1500);
    await expect(page.getByTestId('status-health')).toHaveText('30 of 100');
    await expect(page.getByTestId('damage-flash')).toHaveCount(1);
    await expect(page.getByTestId('low-health')).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: 'Health low' })).toHaveCount(1);
  });

  test('sound can be toggled from the pause menu or with M, and the choice persists', async ({ page }) => {
    await startMatch(page, { overrides: NO_SPAWNS });
    await page.keyboard.press('Escape');
    const toggle = page.getByTestId('sound-toggle');
    await expect(toggle).toHaveText('Sound: On');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveText('Sound: Off');
    await page.getByTestId('pause-resume').click();

    await page.keyboard.press('KeyM');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sound-toggle')).toHaveText('Sound: On');
    await page.getByTestId('sound-toggle').click();

    await page.reload();
    await startMatch(page, { fromMenu: true, overrides: NO_SPAWNS });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sound-toggle')).toHaveText('Sound: Off');
  });
});
