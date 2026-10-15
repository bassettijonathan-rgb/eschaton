import { expect, test } from '@playwright/test';
import { viewAs } from './helpers';

test('the game-master starts Interdependence Day, and the TRIGSIT plays out in order', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.locator('#scenario').selectOption('interdependence-day');
  await page.locator('#start-scenario').click();
  await expect(page).toHaveURL(/scenario=interdependence-day/);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#game-panel')).toContainText('Interdependence Day, Y.D.A.U.');
  // No insurgent cell in this game.
  await expect(page.locator('#defcon-row li')).toHaveCount(6);

  await page.locator('#skip-to-play').click();
  await expect(page.locator('#game-panel')).toHaveAttribute('data-phase', 'play');
  const events = page.locator('#trigsit-standing li');
  await expect(events).toHaveCount(14);
  await expect(events.first()).toContainText('Explosions at AMNAT satellite-receiver stations');
  await expect(events.nth(10)).toContainText('Tehran and Baghdad come in behind LIBSYR');
  await expect(events.last()).toContainText('Decision Tree');
  const log = page.locator('#game-log');
  await expect(log).toContainText(
    'TRIGSIT 11: Tehran and Baghdad come in behind LIBSYR, which is now IRLIBSYR',
  );
  await expect(log).toContainText(
    "Otis P. Lord runs EndStat's Decision Tree for AMNAT, and it dictates: a SPASEX response against IRLIBSYR",
  );
  await expect(page.locator('#defcon-row li[data-combatant="AMNAT"]')).toHaveText('AMNAT MAX');
  await expect(page.locator('#defcon-row li[data-combatant="LIBSYR"]')).toHaveText('IRLIBSYR 4');
  await expect(page.getByLabel('Viewing as').locator('option[value="LIBSYR"]')).toHaveText(
    'IRLIBSYR',
  );

  // Mid-afternoon the first snow of the year falls, and it is snowing on the map, not the territory.
  for (let i = 0; i < 6; i++) await page.locator('#advance-clock').click();
  await expect(page.locator('body')).toHaveAttribute('data-court-weather', 'snow');
  await expect(log).toContainText('The first snow of the year starts to fall');

  // The cast is at the courts.
  await page.getByLabel('Viewing as').selectOption('LIBSYR');
  await expect(page.locator('#handoff')).toContainText(
    'IRLIBSYR (Iran–Libya–Syria): Evan Ingersoll',
  );
  await page.locator('#handoff-take').click();
  await expect(page.locator('#team')).toHaveText('Team: Evan Ingersoll (Leader).');
  await viewAs(page, 'INDPAK');
  await page.locator('#weather-appeal').click();
  await expect(log).toContainText('Ruling from Michael Pemulis, outside the fence');

  // The siren ends it.
  await viewAs(page, 'gm');
  while ((await page.locator('#game-panel').getAttribute('data-phase')) === 'play')
    await page.locator('#advance-clock').click();
  await expect(page.locator('#game-over')).toContainText('The 1600h siren.');
  expect(errors).toEqual([]);
});
