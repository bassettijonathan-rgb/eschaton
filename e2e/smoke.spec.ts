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
