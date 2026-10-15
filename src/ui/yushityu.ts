/**
 * The Yushityu portable on Lord's cart, running EndStat: the running
 * tallies, the strike log with its working, and the crunch that confirms a
 * winner. The game-master sees every tally; a Combatant sees only its own.
 */
import { canSeeBucket, type Viewer } from '../engine/buckets';
import { COMBATANTS } from '../engine/data/combatants';
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

export function mountYushityu(host: HTMLElement): void {
  const tallies = el('div', { className: 'endstat-tallies' });
  const log = el('div', {});
  const authentic = el('input', { type: 'checkbox', id: 'endstat-authentic' });
  const confirm = el('button', { type: 'button', id: 'endstat-confirm' }, ['Confirm a winner']);
  const crunch = mountCrunch(host);
  confirm.addEventListener('click', () => {
    crunch(authentic.checked);
  });

  const update = (): void => {
    const report = getState().endstat;
    tallies.replaceChildren(talliesTable(report, getViewer()));
    log.replaceChildren(strikeLog(report));
  };
  onStateChange(update);
  onViewerChange(update);
  update();

  host.append(
    el('details', { className: 'panel yushityu-panel', id: 'endstat-panel' }, [
      el('summary', {}, ['EndStat on the Yushityu']),
      el('div', { className: 'yushityu-screen' }, [
        tallies,
        el('h3', {}, ['Strikes']),
        log,
        el('div', { className: 'crunch-controls' }, [
          confirm,
          el('label', { htmlFor: 'endstat-authentic' }, [authentic, ' Authentic three hours']),
        ]),
      ]),
    ]),
  );
}
