/**
 * The game-master's view of megatonnage allocation for the default World
 * Situation. Players never see this table in play: buckets hide counts.
 */
import { ALLOCATION_METHOD_LABELS, allocate, type Allocation } from '../engine/allocation';
import { COMBATANTS } from '../engine/data/combatants';
import { DEFAULT_WORLD_SITUATION } from '../engine/data/worldSituation';
import { createRng } from '../engine/rng';
import type { AllocationMethod } from '../engine/types';

const METHODS = Object.keys(ALLOCATION_METHOD_LABELS) as AllocationMethod[];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function renderTable(allocation: Allocation): HTMLTableElement {
  const rows = allocation.lines.map((l) => {
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
  return el('table', {}, [
    el('caption', {}, [`${String(allocation.totalWarheads)} of 400 balls allocated`]),
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
      el('option', { value: m, selected: m === DEFAULT_WORLD_SITUATION.allocationMethod }, [
        ALLOCATION_METHOD_LABELS[m],
      ]),
    ),
  );
  const tableHost = el('div', { className: 'allocation-table' });
  const update = (): void => {
    const method = select.value as AllocationMethod;
    const allocation = allocate(DEFAULT_WORLD_SITUATION, COMBATANTS, {
      method,
      rng: createRng(DEFAULT_WORLD_SITUATION.seed),
    });
    tableHost.replaceChildren(renderTable(allocation));
  };
  select.addEventListener('change', update);
  update();

  host.append(
    el('details', { className: 'panel allocation-panel', id: 'allocation-panel' }, [
      el('summary', {}, ['EndStat: megatonnage allocation']),
      el('p', { className: 'panel-note' }, [
        "Game-master's view of the default World Situation. In play, each Combatant sees only its own bucket.",
      ]),
      el('label', { htmlFor: 'allocation-method' }, ['Method ']),
      select,
      tableHost,
    ]),
  );
}
