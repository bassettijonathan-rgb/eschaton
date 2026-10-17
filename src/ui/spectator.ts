/**
 * Watching a game from the pavilion: the computer plays every Combatant and
 * runs the table, and the person at the screen only watches. The game-master's
 * clipboard and the racquet give way to a running commentary, a scoreboard
 * and a caption over the courts saying what each ball is for and what it did.
 */
import { GAME_MASTER } from '../engine/buckets';
import { OWNER_COLORS } from '../engine/data/territories';
import { SCENARIOS } from '../engine/data/scenarios';
import {
  clockLabel,
  defconLabel,
  MAXIMUM_READINESS,
  type GameState,
  type Phase,
} from '../engine/game';
import type { CombatantId } from '../engine/types';
import {
  commentOn,
  explainPhase,
  leaderLine,
  scoreboard,
  verdict,
  type Comment,
} from './commentary';
import {
  computerPlaysAll,
  getPace,
  isPaused,
  onComputersChange,
  setPace,
  setPaused,
  type Pace,
} from './computers';
import { el } from './dom';
import { getActionLog, getState, onAction, onStateChange, resetGame } from './store';
import { setViewer } from './viewer';

const PHASES: readonly { phase: Phase; label: string }[] = [
  { phase: 'worldSituation', label: 'World Situation' },
  { phase: 'trigsit', label: 'TRIGSIT' },
  { phase: 'summit', label: 'Summit' },
  { phase: 'play', label: 'Play' },
  { phase: 'ended', label: 'Verdict' },
];

const PACES: readonly { value: Pace; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

/** How many commentary lines the panel keeps. */
const KEEP = 60;

let watchingNow = false;
const listeners = new Set<(on: boolean) => void>();

const LANDING_KEY = 'eschaton-landing';

/** Whether the page opens on watching (the default) or on the game-master's clipboard. */
export function landsOnWatching(params: URLSearchParams): boolean {
  if (params.has('watch')) return true;
  if (params.has('play')) return false;
  try {
    return globalThis.localStorage.getItem(LANDING_KEY) !== 'play';
  } catch {
    return true;
  }
}

function rememberLanding(where: 'watch' | 'play'): void {
  try {
    globalThis.localStorage.setItem(LANDING_KEY, where);
  } catch {
    // Without storage the page simply opens on watching.
  }
}

/** Nothing has happened yet: the game waits for Start. */
const notStarted = (): boolean => getActionLog().length === 0;

export function watching(): boolean {
  return watchingNow;
}

export function onWatchingChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Hand every seat and the table to the computer, and sit in the pavilion. A
 * game that has not begun waits for Start; one under way carries on.
 */
export function startWatching(): void {
  setViewer(GAME_MASTER);
  computerPlaysAll(getState().situation.combatants);
  setPaused(notStarted());
  rememberLanding('watch');
  watchingNow = true;
  document.body.dataset['watching'] = 'true';
  for (const fn of listeners) fn(true);
}

/** Back to the clipboard; the computers keep their seats until someone takes them. */
export function stopWatching(): void {
  setPaused(false);
  rememberLanding('play');
  watchingNow = false;
  document.body.dataset['watching'] = 'false';
  for (const fn of listeners) fn(false);
}

/** The address that starts watching a scenario straight away. */
export function watchUrl(scenario: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('scenario', scenario);
  url.searchParams.set('watch', '');
  return url.toString().replace(/watch=(&|$)/, 'watch$1');
}

export interface Spectator {
  /** A ball has landed: tell what it did. */
  landed(lobs: number): void;
}

export interface SpectatorOptions {
  /** Open EndStat's crunch on the Yushityu. */
  crunch(): void;
}

const swatch = (id: CombatantId | undefined): HTMLElement => {
  const s = el('span', { className: 'swatch' });
  if (id) s.style.background = OWNER_COLORS[id];
  return s;
};

export function mountSpectator(host: HTMLElement, options: SpectatorOptions): Spectator {
  const title = el('h2', { id: 'spectator-title' });
  const steps = el('ol', { className: 'phase-steps', id: 'phase-steps' });
  const clock = el('p', { className: 'spectator-clock', id: 'spectator-clock' });
  const play = el('button', { type: 'button', id: 'spectator-play', className: 'big' });
  const restart = el('button', { type: 'button', id: 'spectator-restart', className: 'big' }, [
    '↺ Start over',
  ]);
  const pace = el(
    'select',
    { id: 'spectator-pace' },
    PACES.map((p) => el('option', { value: p.value }, [p.label])),
  );
  const leave = el('button', { type: 'button', id: 'spectator-leave' }, ['Play it yourself']);
  const about = el('p', { className: 'spectator-about', id: 'spectator-about' });
  const leader = el('p', { className: 'spectator-leader', id: 'spectator-leader' });
  const scoreBody = el('tbody', {});
  const score = el('table', { className: 'spectator-score', id: 'spectator-score' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col' }, ['Team']),
        el('th', { scope: 'col', className: 'num', title: 'DEFCON: higher is more alert' }, [
          'Alert',
        ]),
        el('th', { scope: 'col', className: 'num', title: 'Warheads left in the bucket' }, [
          'Balls',
        ]),
        el('th', { scope: 'col', className: 'num', title: 'Harm done to others (INDDIR)' }, [
          'Done',
        ]),
        el('th', { scope: 'col', className: 'num', title: 'Harm suffered (SUFDDIR)' }, [
          'Suffered',
        ]),
        el('th', { scope: 'col', className: 'num', title: 'Harm done ÷ harm suffered' }, ['Ratio']),
      ]),
    ]),
    scoreBody,
  ]);
  const ending = el('div', { className: 'spectator-ending', id: 'spectator-ending', hidden: true });
  const feed = el('ol', { className: 'commentary', id: 'commentary' });
  const panel = el(
    'section',
    { className: 'panel spectator-panel', id: 'spectator', hidden: true },
    [
      el('div', { className: 'spectator-controls' }, [
        play,
        restart,
        el('label', { htmlFor: 'spectator-pace' }, ['Speed ', pace]),
        leave,
      ]),
      title,
      steps,
      clock,
      about,
      el('h3', {}, ['The score']),
      leader,
      score,
      el('p', { className: 'panel-note' }, [
        'Done and Suffered are EndStat’s INDDIR and SUFDDIR, after its corrections. Ratio is done ÷ suffered; ∞ means harm done and none suffered.',
      ]),
      ending,
      el('h3', {}, ['What just happened']),
      feed,
    ],
  );
  panel.setAttribute('aria-labelledby', 'spectator-title');
  const caption = el('div', {
    className: 'spectator-caption',
    id: 'spectator-caption',
    hidden: true,
  });
  caption.setAttribute('aria-hidden', 'true');
  host.append(panel, caption);

  let comments: Comment[] = [];
  let landedLobs = getState().lobs.length;
  let seenLog = getState().log.length;
  /** The game as the watcher has seen it: it does not move on while a ball is still in the air. */
  let shown: GameState = getState();

  const visible = (): Comment[] => comments.filter((c) => c.afterLobs <= landedLobs);

  const renderFeed = (): void => {
    const lines = visible();
    feed.replaceChildren(
      ...lines
        .slice(-KEEP)
        .reverse()
        .map((c) => {
          const li = el('li', { className: `comment comment-${c.kind}` }, [
            swatch(c.by),
            el('span', { className: 'comment-at' }, [clockLabel(c.at)]),
            ' ',
            c.text,
          ]);
          if (c.by) li.dataset['combatant'] = c.by;
          return li;
        }),
    );
    const last = lines.filter((c) => c.kind !== 'phase').at(-1) ?? lines.at(-1);
    caption.replaceChildren();
    if (watchingNow && isPaused()) {
      caption.append(
        notStarted()
          ? 'Press ▶ Start to watch the computer play every side of a whole game. Each move is explained as it happens.'
          : 'Paused. Press ▶ Resume to carry on.',
      );
      caption.dataset['kind'] = 'paused';
      caption.hidden = false;
    } else if (last && watchingNow) {
      caption.append(swatch(last.by), last.text);
      caption.dataset['kind'] = last.kind;
      caption.hidden = false;
    } else caption.hidden = true;
  };

  const renderScore = (): void => {
    const s = shown;
    title.textContent = `Watching: ${s.situation.title}`;
    const at = PHASES.findIndex((p) => p.phase === s.phase);
    steps.replaceChildren(
      ...PHASES.map((p, i) => {
        const li = el('li', { className: i < at ? 'done' : i === at ? 'now' : '' }, [p.label]);
        if (i === at) li.setAttribute('aria-current', 'step');
        return li;
      }),
    );
    const end = s.situation.clock?.end;
    clock.textContent = `${clockLabel(s.clock)}${end === undefined ? '' : `, siren at ${clockLabel(end)}`}. ${s.lobs.length === 1 ? '1 ball' : `${String(s.lobs.length)} balls`} lobbed.`;
    about.textContent = explainPhase(s.phase, s);
    leader.textContent = s.phase === 'ended' ? verdict(s) : leaderLine(s);
    scoreBody.replaceChildren(
      ...scoreboard(s).map((r) => {
        const tr = el('tr', { className: r.leads ? 'leads' : '' }, [
          el('th', { scope: 'row' }, [
            swatch(r.combatant),
            r.code,
            ...(r.sacpop ? [' ☢'] : []),
            ...(r.leads ? [el('span', { className: 'leads-tag' }, [' leads'])] : []),
          ]),
          el('td', { className: 'num', title: r.defcon ? defconLabel(r.defcon) : '' }, [
            r.defcon === MAXIMUM_READINESS ? 'MAX' : String(r.defcon ?? '—'),
          ]),
          el('td', { className: 'num' }, [String(r.left)]),
          el('td', { className: 'num' }, [r.done.toFixed(1)]),
          el('td', { className: 'num' }, [r.suffered.toFixed(1)]),
          el('td', { className: 'num' }, [r.ratio]),
        ]);
        tr.dataset['combatant'] = r.combatant;
        if (r.sacpop) tr.title = 'Has gone SACPOP: struck a city on purpose';
        return tr;
      }),
    );
    ending.hidden = s.phase !== 'ended';
    if (s.phase === 'ended') {
      const crunch = el('button', { type: 'button', id: 'spectator-crunch' }, [
        'Show EndStat’s working',
      ]);
      crunch.addEventListener('click', () => {
        options.crunch();
      });
      const again = SCENARIOS.filter((x) => x.id !== s.situation.id).map((x) => {
        const b = el('button', { type: 'button', className: 'watch-again' }, [`Watch ${x.title}`]);
        b.dataset['scenario'] = x.id;
        b.addEventListener('click', () => {
          window.location.assign(watchUrl(x.id));
        });
        return b;
      });
      ending.replaceChildren(crunch, ...again);
    }
  };

  const renderControls = (): void => {
    const paused = isPaused();
    const fresh = notStarted();
    play.textContent = paused ? (fresh ? '▶ Start' : '▶ Resume') : '⏸ Pause';
    play.classList.toggle('go', paused);
    restart.disabled = fresh;
    pace.value = getPace();
    panel.dataset['paused'] = String(paused);
  };

  /** Bring the scoreboard up to date once every ball in the air has landed. */
  const catchUp = (): void => {
    const s = getState();
    if (s.lobs.length <= landedLobs) shown = s;
    renderScore();
    renderFeed();
    renderControls();
  };

  /** Back to the World Situation with a fresh game, and play it straight away. */
  const startOver = (): void => {
    resetGame();
    comments = [
      {
        at: getState().clock,
        text: explainPhase(getState().phase, getState()),
        kind: 'phase',
        afterLobs: 0,
      },
    ];
    setPaused(false);
    catchUp();
  };

  onAction((prev, action, next) => {
    comments = [...comments, ...commentOn(prev, action, next)].slice(-KEEP * 2);
    seenLog = next.log.length;
  });
  onStateChange((s) => {
    // A new game (or a fresh draft of the World Situation) starts the commentary again.
    if (s.lobs.length < landedLobs || s.log.length < seenLog) {
      comments = [];
      landedLobs = s.lobs.length;
    }
    seenLog = s.log.length;
    catchUp();
  });
  play.addEventListener('click', () => {
    setPaused(!isPaused());
  });
  restart.addEventListener('click', startOver);
  pace.addEventListener('change', () => {
    setPace(pace.value as Pace);
  });
  leave.addEventListener('click', () => {
    stopWatching();
  });
  onComputersChange(() => {
    renderControls();
    renderFeed();
  });
  onWatchingChange((on) => {
    panel.hidden = !on;
    if (on) {
      comments = [
        ...comments,
        {
          at: getState().clock,
          text: explainPhase(getState().phase, getState()),
          kind: 'phase',
          afterLobs: getState().lobs.length,
        },
      ];
    }
    catchUp();
    renderControls();
  });
  renderControls();
  catchUp();

  return {
    landed(lobs) {
      landedLobs = Math.max(landedLobs, lobs);
      catchUp();
    },
  };
}
