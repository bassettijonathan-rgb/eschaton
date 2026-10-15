import { expect, test, type Page } from '@playwright/test';
import { startPlay, viewAs } from './helpers';

async function aimAt(page: Page, name: string): Promise<void> {
  await page.locator('#lob-aim').click();
  const pos = await page.evaluate((n) => window.eschaton?.screenPosition(n) ?? null, name);
  if (!pos) throw new Error(`nothing named ${name}`);
  await page.mouse.click(pos.x, pos.y);
}

async function bucket(page: Page): Promise<number> {
  const text = (await page.locator('#lob-bucket').textContent()) ?? '';
  return Number(/^(\d+) in your bucket/.exec(text)?.[1]);
}

async function swing(page: Page): Promise<void> {
  const button = page.locator('#lob-swing');
  await button.click();
  await expect(button).toHaveText('Hit!');
  await button.click();
}

async function swingAndHit(page: Page): Promise<void> {
  const swing = page.locator('#lob-swing');
  await swing.click();
  await expect(swing).toHaveText('Hit!');
  await swing.click();
  await expect(page.locator('#lob-problems')).toContainText('Timing:');
}

test('the game-master does not lob', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#lob-panel')).toContainText('The game-master does not lob');
  await expect(page.locator('#lob-swing')).toBeHidden();
});

test('a Combatant lobs a warhead from its own platform and it detonates where it lands', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await startPlay(page, { AMNAT: 6 });
  await viewAs(page, 'AMNAT');
  await expect(page.locator('#lob-platform option')).toContainText(['Minot missile field']);
  await expect(page.locator('#lob-platform option', { hasText: 'Moscow' })).toHaveCount(0);
  await page.locator('#lob-platform').selectOption({ label: 'Minot missile field' });
  const before = await bucket(page);

  await aimAt(page, 'target-sovwar-moscow');
  await expect(page.locator('#lob-aim-note')).toContainText('Aiming at Russia');

  await swingAndHit(page);
  await expect(page.locator('body')).toHaveAttribute('data-flying', 'false', { timeout: 40_000 });
  await expect(page.locator('#lob-result-title')).toHaveText(
    'AMNAT lobs one warhead from Minot missile field',
  );
  await expect(page.locator('#lob-result li')).toHaveCount(1);
  await expect(page.locator('#lob-result li').first()).toContainText('Warhead 1');
  expect(await bucket(page)).toBe(before - 1);
  expect(errors).toEqual([]);
});

test('a MIRV jockstrap opens and every warhead comes down', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await startPlay(page, { SOVWAR: 6 });
  await viewAs(page, 'SOVWAR');
  const before = await bucket(page);
  await page.locator('#lob-warheads').fill('3');
  await expect(page.locator('#lob-topspin-value')).toHaveText('none (tumbles)');
  await aimAt(page, 'target-amnat-new-york');
  await swingAndHit(page);
  await expect(page.locator('body')).toHaveAttribute('data-flying', 'false', { timeout: 40_000 });
  await expect(page.locator('#lob-result-title')).toContainText('a jockstrap of 3 warheads');
  await expect(page.locator('#lob-result li')).toHaveCount(3);
  expect(await bucket(page)).toBe(before - 3);
});

test('an order is refused until play starts, and a city needs Maximum Readiness', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await viewAs(page, 'AMNAT');
  await page.locator('#lob-platform').selectOption({ label: 'Minot missile field' });
  await aimAt(page, 'target-sovwar-moscow');
  await swing(page);
  await expect(page.locator('#lob-problems')).toContainText('once play has started');

  await viewAs(page, 'gm');
  await startPlay(page, { AMNAT: 5 });
  await viewAs(page, 'AMNAT');
  await page.locator('#lob-platform').selectOption({ label: 'Minot missile field' });
  await aimAt(page, 'target-sovwar-moscow');
  await swing(page);
  await expect(page.locator('#lob-problems')).toContainText('Maximum Readiness');
});
