/**
 * What each garment stands for on the map. The SSTRAC change (A3) is flagged.
 */
import { GARMENTS, GARMENT_FOR_TARGET, TARGET_TYPE_LABELS } from '../engine/data/targets';
import { OWNER_COLORS } from '../engine/data/territories';
import { COMBATANTS } from '../engine/data/combatants';
import { GARMENT_KINDS, TARGET_TYPES } from '../engine/types';
import { GARMENT_SWATCH } from '../render/garments';
import { el } from './dom';

export function mountLegendPanel(host: HTMLElement): void {
  const garments = GARMENT_KINDS.map((kind) => {
    const g = GARMENTS[kind];
    const types = TARGET_TYPES.filter((t) => GARMENT_FOR_TARGET[t] === kind).map(
      (t) => TARGET_TYPE_LABELS[t],
    );
    const swatch = el('span', { className: 'swatch' });
    swatch.style.background = GARMENT_SWATCH[kind];
    const item = el('li', {}, [swatch, el('strong', {}, [g.label]), `: ${types.join('; ')}`]);
    if (g.legendNote)
      item.append(
        el('p', { className: 'legend-flag' }, [`Changed from the novel. ${g.legendNote}`]),
      );
    return item;
  });
  const territories = Object.values(COMBATANTS).map((c) => {
    const swatch = el('span', { className: 'swatch' });
    swatch.style.background = OWNER_COLORS[c.id];
    return el('li', {}, [swatch, `${c.code}: ${c.name}`]);
  });
  const unplayed = el('span', { className: 'swatch' });
  unplayed.style.background = OWNER_COLORS.CANADA;
  territories.push(el('li', {}, [unplayed, 'Unplayed nations: on the map, worth nothing']));

  host.append(
    el('details', { className: 'panel legend-panel', id: 'legend-panel' }, [
      el('summary', {}, ['Legend']),
      el('h2', {}, ['Garments']),
      el('ul', {}, garments),
      el('h2', {}, ['Territory']),
      el('ul', {}, territories),
      el('p', { className: 'panel-note' }, [
        'Players, buckets, racquets and the game-master’s cart stand on the courts but are not part of the map.',
      ]),
    ]),
  );
}
