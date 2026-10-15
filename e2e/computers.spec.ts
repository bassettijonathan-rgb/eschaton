import { expect, test } from '@playwright/test';
import { startPlay, viewAs } from './helpers';

test('the computers play a whole game, and EndStat confirms a winner', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.locator('#cpu-fast').check();
  await page.locator('#cpu-all').click();
  await expect(page.locator('#game-panel')).toHaveAttribute('data-phase', 'summit', {
    timeout: 60_000,
  });
  await expect(page.locator('#game-log')).toContainText('“');
  await expect(page.locator('#game-panel')).toHaveAttribute('data-phase', 'ended', {
    timeout: 200_000,
  });
  await expect(page.locator('#game-over')).toContainText(/EndStat confirms \w+ as the winner/);
  expect(errors).toEqual([]);
});

test('the Decision Tree, and an appeal to Pemulis', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await startPlay(page);
  await page.getByText('EndStat on the Yushityu').click();
  await page.locator('#tree-for').selectOption('LIBSYR');
  await expect(page.locator('#decision-posture')).toContainText('LIBSYR: SPASEX');
  await expect(page.locator('#decision-tree li')).not.toHaveCount(0);

  await page.locator('#appeal-pemulis').click();
  const audit = page.locator('#pemulis-lines');
  await expect(audit).toContainText('ALLOCATION');
  await expect(audit).toContainText('DECISION TREE');
  await expect(audit).toContainText('SOVWAR:');
  await page.locator('#pemulis').getByRole('button', { name: 'Close' }).click();

  // A Combatant's appeal shows only its own numbers.
  await viewAs(page, 'AMNAT');
  await expect(page.locator('#tree-for')).toBeHidden();
  await expect(page.locator('#decision-posture')).toContainText('AMNAT: hold');
  await page.locator('#appeal-pemulis').click();
  await expect(audit).toContainText('AMNAT:');
  await expect(audit).not.toContainText('SOVWAR:');
});
