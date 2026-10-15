import { expect, test, type Page } from '@playwright/test';
import { startPlay, viewAs } from './helpers';

async function perfectLob(page: Page, combatant: string, platform: string, target: string) {
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const problems = await page.evaluate(
    ([c, p, t]) => window.eschaton?.perfectLob(c as 'AMNAT', p, t) ?? ['no hook'],
    [combatant, platform, target] as const,
  );
  expect(problems).toEqual([]);
  await expect(page.locator('body')).toHaveAttribute('data-flying', 'false', { timeout: 40_000 });
}

test('EndStat scores a strike, shows its working and confirms a winner', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await startPlay(page, { AMNAT: 6 });
  await perfectLob(page, 'AMNAT', 'Minot missile field', 'Moscow');

  await page.getByText('EndStat on the Yushityu').click();
  const log = page.locator('#endstat-strikes li');
  await expect(log).toHaveCount(1);
  await expect(log.first()).toContainText('Moscow (direct, firestorm)');
  await expect(log.first()).toContainText('SACPOP');
  await log.first().getByText('Working').click();
  await expect(log.first().locator('pre')).toContainText('Open flat ground: 10.10 km');
  await expect(page.locator('#endstat-tallies tr[data-combatant]')).toHaveCount(7);
  await expect(page.locator('#endstat-tallies tr[data-combatant]').first()).toHaveAttribute(
    'data-combatant',
    'AMNAT',
  );

  await page.locator('#endstat-confirm').click();
  const crunch = page.locator('#crunch');
  await expect(crunch).toBeVisible();
  await expect(crunch).toHaveAttribute('data-done', 'true', { timeout: 20_000 });
  await expect(page.locator('#crunch-verdict')).toContainText('Winner: AMNAT');
  await expect(page.locator('#crunch-lines')).toContainText('Initial megatonnage');
  await crunch.getByRole('button', { name: 'Close' }).click();
  await expect(crunch).toBeHidden();

  await page.locator('#endstat-authentic').check();
  await page.locator('#endstat-confirm').click();
  await expect(page.locator('#crunch-remaining')).toContainText(/^(3:00:00|2:59:\d\d) left$/);
  await expect(crunch).toHaveAttribute('data-done', 'false');
  await crunch.getByRole('button', { name: 'Close' }).click();
  expect(errors).toEqual([]);
});

test('a Combatant sees only its own tally, and the inspector reports the damage', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await startPlay(page, { SOVWAR: 6 });
  await perfectLob(page, 'SOVWAR', 'Dombarovsky silos', 'Detroit');
  await viewAs(page, 'AMNAT');
  await page.getByText('EndStat on the Yushityu').click();
  await expect(page.locator('#endstat-tallies tr[data-combatant]')).toHaveCount(1);
  await expect(page.locator('#endstat-tallies tr[data-combatant]')).toHaveAttribute(
    'data-combatant',
    'AMNAT',
  );

  const pos = await page.evaluate(() => window.eschaton?.screenPosition('target-amnat-detroit'));
  if (!pos) throw new Error('no Detroit');
  await page.mouse.click(pos.x, pos.y);
  await expect(page.locator('#inspector')).toContainText('EndStat:');
  await expect(page.locator('#inspector')).toContainText('firestorm');
});
