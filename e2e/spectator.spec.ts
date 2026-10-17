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

  // The pavilion replaces the clipboard and the racquet, and waits for Start.
  const panel = page.locator('#spectator');
  await expect(panel).toBeVisible();
  await expect(page.locator('#game-panel')).toBeHidden();
  await expect(page.locator('#lob-panel')).toBeHidden();
  await expect(page.locator('#viewer')).toBeHidden();
  await expect(page.locator('#spectator-about')).toContainText('World Situation');
  await expect(page.locator('#spectator-score tbody tr')).toHaveCount(7);
  await expect(page.locator('#spectator-play')).toHaveText('▶ Start');
  await expect(page.locator('#spectator-caption')).toContainText('Press ▶ Start');

  await page.locator('#spectator-pace').selectOption('fast');
  await page.locator('#spectator-play').click();
  await expect(page.locator('#spectator-play')).toHaveText('⏸ Pause');
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
  await expect(page.locator('#spectator-ending .watch-again')).toHaveCount(1);
  await page.locator('#spectator-crunch').click();
  await expect(page.locator('#crunch')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('someone who has never chosen to play', () => {
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4173',
          localStorage: [{ name: 'eschaton-intro-seen', value: 'yes' }],
        },
      ],
    },
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ])
    test(`lands on watching, with Start and Start over in view (${String(viewport.width)} px)`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('#spectator')).toBeVisible();
      await expect(page.locator('#game-panel')).toBeHidden();
      const start = page.locator('#spectator-play');
      await expect(start).toHaveText('▶ Start');
      await expect(start).toBeInViewport();
      await expect(page.locator('#spectator-restart')).toBeInViewport();
      await expect(page.locator('#spectator-restart')).toBeDisabled();

      // Nothing moves until Start.
      await page.waitForTimeout(1_500);
      await expect(page.locator('#game-panel')).toHaveAttribute('data-phase', 'worldSituation');
      await expect(page.locator('#commentary li')).toHaveCount(1);

      await page.locator('#spectator-pace').selectOption('fast');
      await start.click();
      await expect(page.locator('#phase-steps [aria-current="step"]')).toHaveText('Summit', {
        timeout: 30_000,
      });

      // Pause holds the game.
      await start.click();
      await expect(start).toHaveText('▶ Resume');
      const held = await page.evaluate(() => document.querySelector('#game-panel')?.textContent);
      await page.waitForTimeout(2_000);
      expect(await page.evaluate(() => document.querySelector('#game-panel')?.textContent)).toBe(
        held,
      );

      // Start over goes back to a fresh World Situation and plays it.
      await page.locator('#spectator-restart').click();
      await expect(start).toHaveText('⏸ Pause');
      await expect(page.locator('#phase-steps [aria-current="step"]')).toHaveText(
        /World Situation|TRIGSIT/,
      );
      await expect(page.locator('#commentary')).not.toContainText('In fact it holds');
      await expect(page.locator('#phase-steps [aria-current="step"]')).toHaveText('Summit', {
        timeout: 30_000,
      });
    });

  test('Play it yourself is remembered', async ({ page }) => {
    await page.goto('/?watch');
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#welcome')).toBeHidden();
    await page.locator('#spectator-leave').click();
    await expect(page.locator('#spectator')).toBeHidden();
    await expect(page.locator('#game-panel')).toBeVisible();
    await expect(page.locator('#cpu-AMNAT')).toBeChecked();
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#game-panel')).toBeVisible();
    await expect(page.locator('#watch-game')).toBeVisible();
  });
});
