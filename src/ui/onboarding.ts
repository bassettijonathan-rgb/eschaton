/**
 * A short introduction for someone who has never played: five cards, shown
 * on the first visit and again from the "Introduction" button.
 */
import { el } from './dom';

export interface Onboarding {
  open(): void;
}

const KEY = 'eschaton-intro-seen';

const CARDS: readonly { title: string; lines: readonly string[] }[] = [
  {
    title: 'Welcome to the East Courts',
    lines: [
      'Four tennis courts are the world. Dead tennis balls are 5-megaton warheads, and the shirts, towels, socks and sneakers laid on the courts are cities, airfields, missile fields and submarines.',
      'Drag to turn the view and scroll to zoom. With the courts selected, the arrow keys move the view. Click a garment, or use "Find on the courts", to see what it stands for.',
    ],
  },
  {
    title: 'Who is at the screen',
    lines: [
      '"Viewing as" says who is looking: the game-master, or one of the Combatants. Each Combatant sees only its own bucket, profile and messages.',
      'Changing it shows a hand-off screen, so the next player can take over without seeing the last one’s secrets.',
    ],
  },
  {
    title: 'Running a game',
    lines: [
      'The game-master’s clipboard, "The game", runs everything in order: a quorum endorses the World Situation and agrees a TRIGSIT, the summit makes pacts, and then play begins.',
      'Any Combatant can be played by the computer. The page opens on watching: press ▶ Start and the computer plays every side, explaining each move as it happens, with a running score. "Play it yourself" opens this clipboard. "New game" can start the chapter’s own game, Interdependence Day.',
    ],
  },
  {
    title: 'Taking the racquet',
    lines: [
      'As a Combatant in play, open "The racquet". Choose a launch platform, aim on the map, then set elevation, topspin and pace.',
      'Swing against the timing meter, with the Swing button or the space bar. A good swing lands where you aimed; a late or early one does not.',
    ],
  },
  {
    title: 'EndStat, and the rules',
    lines: [
      'EndStat on the Yushityu scores every warhead, shows its working, and suggests what the Decision Tree would do. "Appeal to Pemulis" shows the whole audit trail.',
      'The rulebook has everything else. Remember that the map is not the territory: players are never targets.',
    ],
  },
];

function seen(): boolean {
  try {
    return globalThis.localStorage.getItem(KEY) === 'yes';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    globalThis.localStorage.setItem(KEY, 'yes');
  } catch {
    // Without storage the introduction simply shows again next time.
  }
}

export interface OnboardingOptions {
  openRulebook(): void;
  /** Sit back and watch the computers play, with commentary. */
  watch(): void;
  /** Do not open on a first visit (someone came to watch). */
  skip?: boolean;
}

export function mountOnboarding(host: HTMLElement, options: OnboardingOptions): Onboarding {
  let at = 0;
  const step = el('p', { className: 'welcome-step', id: 'welcome-step' });
  const title = el('h2', { id: 'welcome-title' });
  const body = el('div', { className: 'welcome-body' });
  const back = el('button', { type: 'button', id: 'welcome-back' }, ['Back']);
  const next = el('button', { type: 'button', id: 'welcome-next' }, ['Next']);
  const done = el('button', { type: 'button', id: 'welcome-done' }, ['Start playing']);
  const rules = el('button', { type: 'button', id: 'welcome-rules' }, ['Read the rulebook']);
  const watch = el('button', { type: 'button', id: 'welcome-watch', className: 'primary' }, [
    'Just watch a game',
  ]);
  const dialog = el('dialog', { className: 'welcome', id: 'welcome' }, [
    step,
    title,
    body,
    el('div', { className: 'welcome-actions' }, [back, next, done, rules]),
    el('p', { className: 'welcome-watch' }, [
      watch,
      ' The computer plays every side and explains each move.',
    ]),
  ]);
  dialog.setAttribute('aria-labelledby', 'welcome-title');
  dialog.setAttribute('aria-describedby', 'welcome-step');
  host.append(dialog);

  const show = (): void => {
    const card = CARDS[at];
    if (!card) return;
    step.textContent = `${String(at + 1)} of ${String(CARDS.length)}`;
    title.textContent = card.title;
    body.replaceChildren(...card.lines.map((l) => el('p', {}, [l])));
    back.disabled = at === 0;
    const last = at === CARDS.length - 1;
    next.hidden = last;
    rules.hidden = !last;
    (last ? done : next).focus();
  };
  back.addEventListener('click', () => {
    at = Math.max(0, at - 1);
    show();
  });
  next.addEventListener('click', () => {
    at = Math.min(CARDS.length - 1, at + 1);
    show();
  });
  // Record that the introduction was seen as soon as it is dismissed, by
  // whichever button or by Escape, rather than waiting for the close event.
  done.addEventListener('click', () => {
    markSeen();
    dialog.close();
  });
  rules.addEventListener('click', () => {
    markSeen();
    dialog.close();
    options.openRulebook();
  });
  watch.addEventListener('click', () => {
    markSeen();
    dialog.close();
    options.watch();
  });
  dialog.addEventListener('cancel', markSeen);

  const open = (): void => {
    at = 0;
    if (!dialog.open) dialog.showModal();
    show();
  };
  if (!seen() && !options.skip) open();
  return { open };
}
