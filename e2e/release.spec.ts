import { expect, test } from '@playwright/test';
import { startPlay } from './helpers';

test.describe('a first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('opens the introduction, which steps through by keyboard and is not shown again', async ({
    page,
  }) => {
    await page.goto('/');
    const welcome = page.getByRole('dialog', { name: 'Welcome to the East Courts' });
    await expect(welcome).toBeVisible();
    await expect(page.locator('#welcome-next')).toBeFocused();
    for (let i = 2; i <= 5; i++) {
      await page.keyboard.press('Enter');
      await expect(page.locator('#welcome-step')).toHaveText(`${String(i)} of 5`);
    }
    await expect(page.locator('#welcome-title')).toHaveText('EndStat, and the rules');
    await expect(page.locator('#welcome-done')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#welcome')).toBeHidden();
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#welcome')).toBeHidden();
    await page.getByRole('button', { name: 'Introduction' }).click();
    await expect(page.locator('#welcome')).toBeVisible();
  });
});

test('the rulebook has the rules, the appendices, live sample decision trees and the essay', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const open = page.getByRole('button', { name: 'Rulebook' });
  await open.focus();
  await page.keyboard.press('Enter');
  const book = page.getByRole('dialog', { name: 'Eschaton: the rules, with appendices' });
  await expect(book).toBeVisible();
  await expect(page.locator('#rulebook-close')).toBeFocused();
  await expect(book).toContainText('There is also a black beanie');
  await expect(book).toContainText('so here it means nothing');
  await expect(book.locator('#appendix-trees')).toContainText(
    'Resolve × risk tolerance = 0.32 < 0.35: hold, and let the other side move first.',
  );
  await expect(book.locator('#appendix-trees')).toContainText(
    'In the TRIGSIT, IRLIBSYR sank our minesweeper',
  );
  await expect(book.locator('#essay')).toContainText('a threat is only worth what the other side');
  await book.getByRole('link', { name: 'An essay on the game theory, briefly' }).click();
  await expect(book.locator('#essay h3')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(book).toBeHidden();
  await expect(open).toBeFocused();
});

test('every action but the swing works from the keyboard', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('img', { name: /East Courts 6 through 9/ })).toBeVisible();

  // Inspect a garment without the mouse.
  const finder = page.getByRole('combobox', { name: 'Find on the courts' });
  await finder.focus();
  await finder.selectOption({ label: 'Moscow' });
  await expect(page.locator('#inspector-title')).toHaveText('Moscow');
  await expect(page.locator('#inspector')).toContainText('Worth');
  await finder.selectOption({ label: 'The game-master, wearing the beanie' });
  await expect(page.locator('#inspector-title')).toHaveText('The game-master, wearing the beanie');

  // Run the opening as the game-master.
  await page.locator('#skip-to-play').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-panel')).toHaveAttribute('data-phase', 'play');

  // Hand the screen over: the hand-off screen takes focus, and Enter confirms.
  await page.getByLabel('Viewing as').focus();
  await page.getByLabel('Viewing as').selectOption('AMNAT');
  await expect(page.locator('#handoff-take')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#handoff')).toBeHidden();

  // Raise DEFCON and steer a submarine.
  await page.locator('#defcon').focus();
  await page.locator('#defcon').selectOption('4');
  await expect(page.locator('#defcon-row li[data-combatant="AMNAT"]')).toHaveText('AMNAT 4');
  await page.locator('#move-item').selectOption({ label: 'Atlantic missile submarine' });
  await page.locator('#move-bearing').selectOption({ label: 'east' });
  await page.locator('#move-km').fill('300');
  await page.locator('#move-steer').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-log')).toContainText('Atlantic missile submarine');
  await expect(page.locator('#game-feedback')).toHaveText('');

  // The latest public log line is read out to screen readers.
  await expect(page.locator('#announcer')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#announcer')).toContainText('Atlantic missile submarine');
});

test('a lob pops, the siren sounds, and sound can be turned off', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await startPlay(page, { AMNAT: 6 });
  const problems = await page.evaluate(
    () => window.eschaton?.perfectLob('AMNAT', 'Minot missile field', 'Moscow') ?? ['no hook'],
  );
  expect(problems).toEqual([]);
  await expect(page.locator('body')).toHaveAttribute('data-last-sound', 'pop');
  await expect(page.locator('body')).toHaveAttribute('data-flying', 'false', { timeout: 40_000 });
  for (let i = 0; i < 12; i++) {
    const done = await page.evaluate(
      () => window.eschaton?.dispatch({ type: 'advanceClock', minutes: 15 }) ?? ['no hook'],
    );
    if (done.length > 0) break;
  }
  await expect(page.locator('body')).toHaveAttribute('data-last-sound', 'siren');

  const toggle = page.getByRole('button', { name: 'Sound on' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sound off' })).toBeVisible();
});

test('an idle page stops drawing, and draws again when the view moves', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const frames = (): Promise<number> => page.evaluate(() => window.eschaton?.frames() ?? -1);
  await page.waitForTimeout(1500);
  const before = await frames();
  expect(before).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  expect(await frames()).toBe(before);
  // Turn the view: the courts are drawn while it moves.
  await page.mouse.move(700, 400);
  await page.mouse.down();
  await page.mouse.move(760, 420, { steps: 8 });
  await page.mouse.up();
  await expect.poll(frames).toBeGreaterThan(before + 3);
});
