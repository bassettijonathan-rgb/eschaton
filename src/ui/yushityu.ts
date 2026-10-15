/**
 * The Yushityu portable on Lord's cart, running EndStat: the running
 * tallies, the strike log with its working, and the crunch that confirms a
 * winner. The game-master sees every tally; a Combatant sees only its own.
 * The Decision Tree says what EndStat dictates for a Combatant, and "Appeal
 * to Pemulis" prints the whole audit trail behind every number.
 */
import { POSTURE_LABELS, decisionTree } from '../engine/ai';
import { canSeeBucket, type Viewer } from '../engine/buckets';
import { COMBATANTS } from '../engine/data/combatants';
import type { GameState } from '../engine/game';
import type { CombatantId } from '../engine/types';
import type { EndStatReport } from '../engine/endstat';
import { describeStrike, formatRatio } from './describe';
import { el } from './dom';
import { getState, onStateChange } from './store';
import { getViewer, onViewerChange } from './viewer';

/** EndStat takes about three hours to confirm a winner. */
export const AUTHENTIC_CRUNCH_SECONDS = 3 * 60 * 60;
/** The crunch as most people will want to sit through it. */
export const QUICK_CRUNCH_SECONDS = 4;

const pts = (n: number): string => n.toFixed(2);

function talliesTable(report: EndStatReport, viewer: Viewer): HTMLTableElement {
  const rows = report.standings
    .filter((t) => canSeeBucket(viewer, t.combatant))
    .map((t) => {
      const comm = report.comm[t.combatant];
      const row = el('tr', {}, [
        el('th', { scope: 'row' }, [COMBATANTS[t.combatant].code, ...(t.wentSacpop ? [' ☢'] : [])]),
        el('td', { className: 'num' }, [pts(t.inddir)]),
        el('td', { className: 'num' }, [pts(t.sufddir)]),
        el('td', { className: 'num' }, [formatRatio(t)]),
        el('td', { className: 'num' }, [comm ? `${(comm.capacity * 100).toFixed(0)}%` : '']),
      ]);
      row.dataset['combatant'] = t.combatant;
      if (t.wentSacpop) row.title = 'Has gone SACPOP: struck a city on purpose';
      return row;
    });
  return el('table', { id: 'endstat-tallies' }, [
    el('caption', {}, [
      viewer.kind === 'gameMaster'
        ? 'Corrected tallies, best ratio first. Comm is hotline capacity after EMP.'
        : 'Your tally only. Comm is your hotline capacity after EMP.',
    ]),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col' }, ['']),
        el(
          'th',
          {
            scope: 'col',
            className: 'num',
            title: 'Infliction of Death, Destruction and Incapacitation of Response',
          },
          ['INDDIR'],
        ),
        el('th', { scope: 'col', className: 'num', title: 'Suffering of the same' }, ['SUFDDIR']),
        el('th', { scope: 'col', className: 'num' }, ['Ratio']),
        el('th', { scope: 'col', className: 'num' }, ['Comm']),
      ]),
    ]),
    el('tbody', {}, rows),
  ]);
}

function strikeLog(report: EndStatReport): HTMLElement {
  if (report.strikes.length === 0)
    return el('p', { className: 'panel-note', id: 'endstat-strikes' }, [
      'Nothing has been lobbed yet.',
    ]);
  return el(
    'ol',
    { id: 'endstat-strikes', className: 'strike-log' },
    report.strikes.map((s) =>
      el('li', {}, [
        describeStrike(s),
        el('details', {}, [el('summary', {}, ['Working']), el('pre', {}, [s.working.join('\n')])]),
      ]),
    ),
  );
}

/** What the Decision Tree dictates for one Combatant, branch by branch. */
function treeView(state: GameState, id: CombatantId): HTMLElement {
  const d = decisionTree(state, id);
  const what = d.target && d.platform ? ` Target: ${d.target.name}, from ${d.platform.name}.` : '';
  return el('div', { id: 'decision-tree' }, [
    el('p', { id: 'decision-posture' }, [
      `${COMBATANTS[id].code}: ${POSTURE_LABELS[d.posture]}.${what}`,
    ]),
    el(
      'ol',
      { className: 'strike-log' },
      d.steps.map((x) => el('li', {}, [x])),
    ),
  ]);
}

/**
 * The audit trail behind every number this viewer may see: the allocation,
 * the Decision Tree, each strike's working and the tallies. A Combatant gets
 * its own allocation and tally and the public strike log; the game-master
 * gets everything.
 */
export function auditTrail(state: GameState, viewer: Viewer): string[] {
  const lines: string[] = ['ALLOCATION', ...state.allocation.steps];
  const ids =
    viewer.kind === 'gameMaster'
      ? state.situation.combatants
      : state.situation.combatants.filter((id) => id === viewer.id);
  for (const line of state.allocation.lines)
    if (ids.includes(line.combatant))
      lines.push(`${COMBATANTS[line.combatant].code}:`, ...line.steps.map((x) => `  ${x}`));
  lines.push('', 'DECISION TREE');
  for (const id of ids)
    lines.push(`${COMBATANTS[id].code}:`, ...decisionTree(state, id).steps.map((x) => `  ${x}`));
  lines.push('', 'STRIKES');
  for (const strike of state.endstat.strikes) lines.push(...strike.working);
  if (state.endstat.strikes.length === 0) lines.push('Nothing has been lobbed yet.');
  lines.push('', 'TALLIES');
  if (viewer.kind === 'gameMaster') lines.push(...state.endstat.audit);
  else {
    const t = state.endstat.tallies[viewer.id];
    if (t) {
      lines.push(
        `${COMBATANTS[t.combatant].code}: INDDIR ${pts(t.inddirRaw)} raw, SUFDDIR ${pts(t.sufddirRaw)} raw.`,
        ...t.corrections.map(
          (c) => `  ${c.name} on ${c.appliesTo}: × ${c.factor.toFixed(3)} (${c.reason})`,
        ),
        `  SACPOP penalty ${pts(t.sacpopPenalty)}. Corrected INDDIR ${pts(t.inddir)}, SUFDDIR ${pts(t.sufddir)}, ratio ${formatRatio(t)}.`,
      );
    }
  }
  return lines;
}

function mountAppeal(host: HTMLElement): () => void {
  const lines = el('pre', { className: 'crunch-lines', id: 'pemulis-lines' });
  const close = el('button', { type: 'button' }, ['Close']);
  const dialog = el('dialog', { className: 'yushityu-crunch', id: 'pemulis' }, [
    el('h2', {}, ['Appeal to Pemulis']),
    el('p', {}, ['From outside the fence, the full working behind every figure on this screen.']),
    lines,
    close,
  ]);
  dialog.setAttribute('aria-label', 'The audit trail behind EndStat’s numbers');
  close.addEventListener('click', () => {
    dialog.close();
  });
  host.append(dialog);
  return () => {
    lines.textContent = auditTrail(getState(), getViewer()).join('\n');
    dialog.showModal();
  };
}

/** The crunch: EndStat prints its working, then names the winner. */
function mountCrunch(host: HTMLElement): (authentic: boolean) => void {
  const screen = el('pre', { className: 'crunch-lines', id: 'crunch-lines' });
  const bar = el('progress', { max: 1, value: 0, id: 'crunch-progress' });
  const remaining = el('span', { id: 'crunch-remaining' });
  const verdict = el('div', { id: 'crunch-verdict', className: 'crunch-verdict' });
  const close = el('button', { type: 'button' }, ['Close']);
  const dialog = el('dialog', { className: 'yushityu-crunch', id: 'crunch' }, [
    el('h2', {}, ['EndStat®']),
    screen,
    el('div', { className: 'crunch-progress' }, [bar, remaining]),
    verdict,
    close,
  ]);
  dialog.setAttribute('aria-label', 'EndStat confirms a winner');
  host.append(dialog);
  let timer = 0;
  const stop = (): void => {
    window.clearInterval(timer);
  };
  close.addEventListener('click', () => {
    stop();
    dialog.close();
  });
  dialog.addEventListener('close', stop);

  return (authentic) => {
    stop();
    const report = getState().endstat;
    const lines = [...report.audit];
    const seconds = authentic ? AUTHENTIC_CRUNCH_SECONDS : QUICK_CRUNCH_SECONDS;
    const started = performance.now();
    screen.textContent = '';
    verdict.replaceChildren();
    dialog.dataset['done'] = 'false';
    dialog.showModal();
    let shown = 0;
    const tick = (): void => {
      const f = Math.min(1, (performance.now() - started) / 1000 / seconds);
      bar.value = f;
      const left = Math.max(0, seconds * (1 - f));
      const h = Math.floor(left / 3600);
      const m = Math.floor((left % 3600) / 60);
      const s = Math.floor(left % 60);
      remaining.textContent = `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} left`;
      const want = Math.floor(f * lines.length);
      if (want > shown) {
        screen.textContent += lines.slice(shown, want).join('\n') + '\n';
        screen.scrollTop = screen.scrollHeight;
        shown = want;
      }
      if (f >= 1) {
        stop();
        const w = report.winner;
        verdict.replaceChildren(
          el('p', {}, [
            w
              ? `Winner: ${COMBATANTS[w].code} (${COMBATANTS[w].name}), INDDIR : SUFDDIR ${formatRatio(report.tallies[w] ?? { ratio: undefined })}.`
              : 'No winner: no Combatant has inflicted anything on another.',
          ]),
          talliesTable(report, { kind: 'gameMaster' }),
        );
        dialog.dataset['done'] = 'true';
      }
    };
    tick();
    timer = window.setInterval(tick, 100);
  };
}

export interface Yushityu {
  /** Run EndStat's crunch, as the Confirm button does. */
  readonly crunch: () => void;
}

export function mountYushityu(host: HTMLElement): Yushityu {
  const tallies = el('div', { className: 'endstat-tallies' });
  const log = el('div', {});
  const authentic = el('input', { type: 'checkbox', id: 'endstat-authentic' });
  const confirm = el('button', { type: 'button', id: 'endstat-confirm' }, ['Confirm a winner']);
  const crunch = mountCrunch(host);
  confirm.addEventListener('click', () => {
    crunch(authentic.checked);
  });
  const appeal = el('button', { type: 'button', id: 'appeal-pemulis' }, ['Appeal to Pemulis']);
  appeal.addEventListener('click', mountAppeal(host));

  // The Decision Tree: for the game-master, any Combatant; for a Combatant, itself.
  const tree = el('div', {});
  const treeFor = el('select', { id: 'tree-for' });
  treeFor.append(
    ...getState().situation.combatants.map((id) =>
      el('option', { value: id }, [COMBATANTS[id].code]),
    ),
  );
  const treeRow = el('div', { className: 'crunch-controls' }, [
    el('label', { htmlFor: 'tree-for' }, ['For ']),
    treeFor,
  ]);
  const panel = el('details', { className: 'panel yushityu-panel', id: 'endstat-panel' });
  const showTree = (): void => {
    if (!panel.open) return;
    const viewer = getViewer();
    treeRow.hidden = viewer.kind !== 'gameMaster';
    const id = viewer.kind === 'gameMaster' ? (treeFor.value as CombatantId) : viewer.id;
    const state = getState();
    tree.replaceChildren(
      state.situation.combatants.includes(id)
        ? treeView(state, id)
        : el('p', { className: 'panel-note' }, ['Not playing this game.']),
    );
  };
  treeFor.addEventListener('change', showTree);

  const update = (): void => {
    const report = getState().endstat;
    tallies.replaceChildren(talliesTable(report, getViewer()));
    log.replaceChildren(strikeLog(report));
    showTree();
  };
  onStateChange(update);
  onViewerChange(update);
  update();

  panel.append(
    el('summary', {}, ['EndStat on the Yushityu']),
    el('div', { className: 'yushityu-screen' }, [
      tallies,
      el('h3', {}, ['Strikes']),
      log,
      el('h3', {}, ['Decision Tree']),
      treeRow,
      tree,
      el('div', { className: 'crunch-controls' }, [
        confirm,
        el('label', { htmlFor: 'endstat-authentic' }, [authentic, ' Authentic three hours']),
        appeal,
      ]),
    ]),
  );
  panel.addEventListener('toggle', showTree);
  host.append(panel);
  return {
    crunch: () => {
      crunch(authentic.checked);
    },
  };
}
