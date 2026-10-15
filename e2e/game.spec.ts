import { expect, test, type Page } from '@playwright/test';
import { startPlay, viewAs } from './helpers';

const panel = (page: Page) => page.locator('#game-panel');

async function openPanel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const p = document.getElementById('game-panel') as HTMLDetailsElement | null;
    if (p) p.open = true;
  });
}

test('the opening: a quorum endorses, agrees a TRIGSIT, and makes pacts at the summit', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(panel(page)).toHaveAttribute('data-phase', 'worldSituation');
  await expect(page.locator('#endorsements')).toContainText('0 of the 4 needed');

  for (const id of ['AMNAT', 'SOVWAR', 'REDCHI', 'LIBSYR']) {
    await viewAs(page, id);
    await page.locator('#endorse').click();
  }
  await expect(panel(page)).toHaveAttribute('data-phase', 'trigsit');

  await viewAs(page, 'gm');
  await page.locator('#trigsit-pick').selectOption('strait-incident');
  await page.locator('#propose-trigsit').click();
  await expect(page.locator('#trigsit-title')).toContainText('Strait of Hormuz');
  for (const id of ['AMNAT', 'SOVWAR', 'REDCHI', 'LIBSYR']) {
    await viewAs(page, id);
    await page.locator('#agree-trigsit').click();
  }
  await expect(panel(page)).toHaveAttribute('data-phase', 'summit');

  // AMNAT proposes a hotline to SOVWAR; SOVWAR accepts; REDCHI never hears of it.
  await viewAs(page, 'AMNAT');
  await page.locator('#pact-kind').selectOption('hotline');
  await page.locator('#pact-partner').selectOption('SOVWAR');
  await page.locator('#pact-propose').click();
  await expect(page.locator('#pacts')).toContainText('proposed by AMNAT');
  await viewAs(page, 'SOVWAR');
  await page.locator('[id^="accept-pact-"]').click();
  await expect(page.locator('#pacts')).toContainText('agreed');
  await viewAs(page, 'REDCHI');
  await expect(page.locator('#pacts')).toHaveText('None.');

  await viewAs(page, 'gm');
  await page.locator('#close-summit').click();
  await expect(panel(page)).toHaveAttribute('data-phase', 'play');

  // The hotline carries AMNAT's message to SOVWAR, and no one else's.
  await viewAs(page, 'AMNAT');
  await page.locator('#message-to').selectOption('SOVWAR');
  await page.locator('#message-text').fill('Stand down your boats and we will too.');
  await page.locator('#message-send').click();
  await expect(page.locator('#inbox')).toContainText('AMNAT → SOVWAR');
  await viewAs(page, 'SOVWAR');
  await expect(page.locator('#inbox')).toContainText('Stand down your boats');
  await viewAs(page, 'LIBSYR');
  await page.locator('#message-text').fill('Hello?');
  await page.locator('#message-send').click();
  await expect(page.locator('#game-feedback')).toContainText('hotline');

  // DEFCON is public; a Combatant sets its own.
  await viewAs(page, 'AMNAT');
  await page.locator('#defcon').selectOption('6');
  await expect(page.locator('#defcon-row li[data-combatant="AMNAT"]')).toHaveText('AMNAT MAX');
  expect(errors).toEqual([]);
});

test('the beanies, Human God and the siren', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startPlay(page);
  await openPanel(page);
  await expect(page.locator('body')).toHaveAttribute('data-beanie', 'gray');

  await page.locator('#beanie-red').click();
  await expect(page.locator('body')).toHaveAttribute('data-beanie', 'red');
  await expect(page.locator('#defcon-row li.max')).toHaveCount(7);
  await page.locator('#beanie-black').click();
  await expect(page.locator('body')).toHaveAttribute('data-beanie', 'black');
  await expect(page.locator('#game-status')).toContainText('Beanie: black');
  await page.locator('#beanie-gray').click();
  await expect(page.locator('body')).toHaveAttribute('data-beanie', 'gray');

  // Human God: the order goes to a person, who may wave it through.
  await page.locator('#human-god').check();
  const problems = await page.evaluate(
    () => window.eschaton?.perfectLob('AMNAT', 'Minot missile field', 'Moscow') ?? ['no hook'],
  );
  expect(problems).toEqual([]);
  await expect(page.locator('#rulings li')).toHaveCount(1);
  await expect(page.locator('#rulings li')).toContainText('AMNAT orders a lob');
  await page.locator('[id^="rule-allow-"]').click();
  await expect(page.locator('#rulings')).toHaveText('Nothing.');
  await expect(page.locator('body')).toHaveAttribute('data-lobs', '1', { timeout: 40_000 });

  // The siren at 1600h ends the game, and EndStat names the winner.
  await page.locator('#human-god').uncheck();
  for (let i = 0; i < 10; i++) await page.locator('#advance-clock').click();
  await expect(panel(page)).toHaveAttribute('data-phase', 'ended');
  await expect(page.locator('#game-over')).toContainText('EndStat confirms AMNAT as the winner');
  await page.locator('#show-crunch').click();
  await expect(page.locator('#crunch')).toBeVisible();
});
