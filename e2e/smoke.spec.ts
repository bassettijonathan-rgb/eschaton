import { expect, test } from '@playwright/test';

test('the page loads and draws the four courts, the map and every garment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle('Eschaton');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-courts', '4');
  await expect(page.locator('body')).toHaveAttribute('data-garments', '139');
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

async function clickOn(page: import('@playwright/test').Page, name: string): Promise<void> {
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const pos = await page.evaluate((n) => window.eschaton?.screenPosition(n) ?? null, name);
  if (!pos) throw new Error(`nothing named ${name}`);
  await page.mouse.click(pos.x, pos.y);
}

test('clicking a garment names what it is on the map', async ({ page }) => {
  await page.goto('/');
  await clickOn(page, 'target-amnat-new-york');
  const inspector = page.locator('#inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('New York');
  await expect(inspector).toContainText('MAMA (Major Metro Area)');
  await expect(inspector).toContainText('gray-and-red E.T.A. T-shirt');

  await page.keyboard.press('Escape');
  await expect(inspector).toBeHidden();
});

test("a Combatant cannot see another Combatant's bucket", async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Viewing as').selectOption('SOVWAR');
  await clickOn(page, 'amnat-bucket');
  await expect(page.locator('#inspector')).toContainText('cannot see how many warheads');

  await page.getByLabel('Viewing as').selectOption('AMNAT');
  await expect(page.locator('#inspector')).toContainText(/Holds \d+ warheads/);

  await page.getByText('EndStat: megatonnage allocation').click();
  await expect(page.locator('tr[data-combatant]')).toHaveCount(1);
});
