import { expect, type Page } from '@playwright/test';

/** Hand the screen to someone, through the hand-off screen. */
export async function viewAs(page: Page, who: string): Promise<void> {
  await page.getByLabel('Viewing as').selectOption(who);
  await page.locator('#handoff-take').click();
  await expect(page.locator('#handoff')).toBeHidden();
}

/** Fold the game panel away so it does not cover the western courts. */
export async function foldGamePanel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const panel = document.getElementById('game-panel') as HTMLDetailsElement | null;
    if (panel) panel.open = false;
  });
}

/** As the game-master, run the opening straight through to play, then set DEFCONs. */
export async function startPlay(page: Page, defcon: Record<string, number> = {}): Promise<void> {
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.locator('#skip-to-play').click();
  await expect(page.locator('#game-panel')).toHaveAttribute('data-phase', 'play');
  for (const [by, level] of Object.entries(defcon)) {
    const problems = await page.evaluate(
      ([b, l]) =>
        window.eschaton?.dispatch({ type: 'setDefcon', by: b as 'AMNAT', level: l as 6 }) ?? [
          'no hook',
        ],
      [by, level] as const,
    );
    expect(problems).toEqual([]);
  }
  await foldGamePanel(page);
}
