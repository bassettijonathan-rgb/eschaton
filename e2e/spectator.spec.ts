import { expect, test } from '@playwright/test';

test('watching a game: what each ball is for, the score, and why the winner won', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.locator('#watch-game').click();

  // The pavilion replaces the clipboard and the racquet.
  const panel = page.locator('#spectator');
  await expect(panel).toBeVisible();
  await expect(page.locator('#game-panel')).toBeHidden();
  await expect(page.locator('#lob-panel')).toBeHidden();
  await expect(page.locator('#viewer')).toBeHidden();
  await expect(page.locator('#spectator-about')).toContainText('World Situation');
  await expect(page.locator('#spectator-score tbody tr')).toHaveCount(7);

  await page.locator('#spectator-pace').selectOption('fast');
  await expect(page.locator('#phase-steps [aria-current="step"]')).toHaveText('Summit', {
    timeout: 60_000,
  });
  await expect(page.locator('#commentary')).toContainText('In fact it holds');
  await expect(page.locator('#phase-steps [aria-current="step"]')).toHaveText('Play', {
    timeout: 60_000,
  });
  const feed = page.locator('#commentary');
  await expect(feed).toContainText(/lobs one warhead from .+ at /, { timeout: 60_000 });
  await expect(feed).toContainText(/Missed by|Direct hit|caught/, { timeout: 60_000 });
  await expect(page.locator('#spectator-caption')).toBeVisible();

  await expect(page.locator('#phase-steps [aria-current="step"]')).toHaveText('Verdict', {
    timeout: 200_000,
  });
  await expect(page.locator('#spectator-leader')).toContainText(/\w+ wins/);
  await expect(page.locator('#spectator-score tr.leads')).toHaveCount(1);
  await expect(page.locator('#spectator-ending .watch-again')).toHaveCount(2);
  await page.locator('#spectator-crunch').click();
  await expect(page.locator('#crunch')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('a first visit straight to the pavilion', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('?watch skips the introduction, and Pause holds the game', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/?watch');
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#spectator')).toBeVisible();
    await expect(page.locator('#welcome')).toBeHidden();

    await page.locator('#spectator-pace').selectOption('fast');
    await expect(page.locator('#phase-steps [aria-current="step"]')).toHaveText('Summit', {
      timeout: 30_000,
    });
    await page.locator('#spectator-pause').click();
    await expect(page.locator('#spectator-pause')).toHaveText('Resume');
    const held = await page.evaluate(() => document.querySelector('#game-panel')?.textContent);
    await page.waitForTimeout(2_000);
    expect(await page.evaluate(() => document.querySelector('#game-panel')?.textContent)).toBe(
      held,
    );

    // Back to the clipboard: the computers keep their seats.
    await page.locator('#spectator-leave').click();
    await expect(page.locator('#spectator')).toBeHidden();
    await expect(page.locator('#game-panel')).toBeVisible();
    await expect(page.locator('#cpu-AMNAT')).toBeChecked();
  });
});
