/**
 * EndStat's megatonnage allocation. The game-master sees every Combatant's
 * line; a Combatant sees only its own, because buckets hide counts.
 */
import { ALLOCATION_METHOD_LABELS, type Allocation } from '../engine/allocation';
import { canSeeBucket, type Viewer } from '../engine/buckets';
import { COMBATANTS } from '../engine/data/combatants';
import type { AllocationMethod } from '../engine/types';
import { el } from './dom';
import { getState, onStateChange, setMethod } from './store';
import { getViewer, onViewerChange } from './viewer';

const METHODS = Object.keys(ALLOCATION_METHOD_LABELS) as AllocationMethod[];

function renderTable(allocation: Allocation, viewer: Viewer): HTMLTableElement {
  const visible = allocation.lines.filter((l) => canSeeBucket(viewer, l.combatant));
  const rows = visible.map((l) => {
    const def = COMBATANTS[l.combatant];
    const audit = el('details', {}, [
      el('summary', {}, ['How']),
      el(
        'ol',
        {},
        l.steps.map((s) => el('li', {}, [s])),
      ),
    ]);
    const row = el('tr', {}, [
      el('th', { scope: 'row', title: def.expansion }, [def.code]),
      el('td', { className: 'num' }, [String(l.warheads)]),
      el('td', { className: 'num' }, [String(l.megatons)]),
      el('td', {}, [audit]),
    ]);
    row.dataset['combatant'] = l.combatant;
    return row;
  });
  const caption =
    viewer.kind === 'gameMaster'
      ? `${String(allocation.totalWarheads)} of 400 balls allocated`
      : "Your bucket only. Every other Combatant's is hidden from you.";
  return el('table', {}, [
    el('caption', {}, [caption]),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col' }, ['Combatant']),
        el('th', { scope: 'col', className: 'num' }, ['Warheads']),
        el('th', { scope: 'col', className: 'num' }, ['Mt']),
        el('th', { scope: 'col' }, ['Audit']),
      ]),
    ]),
    el('tbody', {}, rows),
  ]);
}

export function mountAllocationPanel(host: HTMLElement): void {
  const select = el(
    'select',
    { id: 'allocation-method' },
    METHODS.map((m) =>
      el('option', { value: m, selected: m === getState().method }, [ALLOCATION_METHOD_LABELS[m]]),
    ),
  );
  const tableHost = el('div', { className: 'allocation-table' });
  const update = (): void => {
    tableHost.replaceChildren(renderTable(getState().allocation, getViewer()));
    select.disabled = getViewer().kind !== 'gameMaster' || getState().phase !== 'worldSituation';
  };
  select.addEventListener('change', () => {
    setMethod(select.value as AllocationMethod);
  });
  onStateChange(update);
  onViewerChange(update);
  update();

  host.append(
    el('details', { className: 'panel allocation-panel', id: 'allocation-panel' }, [
      el('summary', {}, ['EndStat: megatonnage allocation']),
      el('p', { className: 'panel-note' }, [
        'Only the game-master can change the method, and only before the World Situation is endorsed. Each Combatant sees only its own bucket.',
      ]),
      el('label', { htmlFor: 'allocation-method' }, ['Method ']),
      select,
      tableHost,
    ]),
  );
}
