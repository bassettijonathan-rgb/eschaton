import { expect, test, type Page } from '@playwright/test';
import { foldGamePanel, startPlay, viewAs } from './helpers';

const SUB = 'target-amnat-atlantic-missile-submarine';

async function openPanel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const p = document.getElementById('game-panel') as HTMLDetailsElement | null;
    if (p) p.open = true;
  });
}

async function screen(page: Page, name: string): Promise<{ x: number; y: number }> {
  const pos = await page.evaluate((n) => window.eschaton?.screenPosition(n) ?? null, name);
  if (!pos) throw new Error(`nothing named ${name}`);
  return pos;
}

test('it is snowing on the map, not the territory', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await startPlay(page);
  await openPanel(page);
  await page.locator('#court-weather').selectOption('snow');
  await expect(page.locator('body')).toHaveAttribute('data-court-weather', 'snow');
  await expect(page.locator('#game-log')).toContainText('Snow starts falling on the East Courts');

  await viewAs(page, 'INDPAK');
  await page.locator('#weather-appeal').click();
  await expect(page.locator('#game-log')).toContainText(
    'it is snowing on the map, not the territory. Nothing is recalculated.',
  );
  expect(errors).toEqual([]);
});

test('a submarine moves at sea; nothing else on the map moves', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await startPlay(page);
  await viewAs(page, 'AMNAT');
  await openPanel(page);
  await page.locator('#move-item').selectOption({ label: 'Atlantic missile submarine' });
  await page.locator('#move-pick').click();
  await expect(page.locator('body')).toHaveAttribute('data-picking', 'true');
  await foldGamePanel(page);
  const before = await screen(page, SUB);
  await page.mouse.click(before.x + 8, before.y);
  await expect(page.locator('body')).toHaveAttribute('data-picking', 'false');
  await openPanel(page);
  await expect(page.locator('#game-log')).toContainText('AMNAT moves Atlantic missile submarine');
  const after = await screen(page, SUB);
  expect(after.x).toBeGreaterThan(before.x + 4);

  // The inspector says which garments may move and which are fixed to the map.
  await foldGamePanel(page);
  const moscow = await screen(page, 'target-sovwar-moscow');
  await page.mouse.click(moscow.x, moscow.y);
  await expect(page.locator('#inspector')).toContainText('Fixed to the map');
});
