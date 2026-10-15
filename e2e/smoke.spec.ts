import { expect, test } from '@playwright/test';

test('the page loads and draws four empty courts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle('Eschaton');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-courts', '4');
  await expect(page.locator('#theater canvas')).toBeVisible();
  await expect(page.locator('#court-list')).toHaveText('Court 6 · Court 7 · Court 8 · Court 9');
  expect(errors).toEqual([]);
});

test('the game-master can see the megatonnage allocation and change its method', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('EndStat: megatonnage allocation').click();
  const row = (code: string) => page.locator(`tr[data-combatant="${code}"]`);
  await expect(row('SOUTHAF').locator('td').first()).toHaveText('16');
  const amnatMt = Number(await row('AMNAT').locator('td').nth(1).textContent());
  expect(amnatMt).toBeGreaterThanOrEqual(380);
  expect(amnatMt).toBeLessThanOrEqual(420);

  await page.getByLabel('Method').selectOption('yahtzee');
  await row('AMNAT').getByText('How').click();
  await expect(row('AMNAT')).toContainText('red Yahtzee dice');
});
