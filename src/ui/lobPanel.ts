/**
 * The racquet: a Combatant picks a launch platform, aims on the map, sets
 * elevation, topspin and pace, then swings against the timing meter.
 */
import { COMBATANTS } from '../engine/data/combatants';
import { platformsFor, solveSpeed, type LobResult, type Platform } from '../engine/lob';
import { greatCircleKm, project, unproject, type CourtPoint } from '../engine/projection';
import { territoryAt } from '../engine/territory';
import type { CombatantId } from '../engine/types';
import { describeLob } from './describe';
import { el } from './dom';
import { getState, launch, onStateChange } from './store';
import { getViewer, onViewerChange } from './viewer';

/** One sweep of the timing meter from early to late and back, seconds. */
export const METER_PERIOD = 1.6;

export interface LobPanelHooks {
  onAimingChange(aiming: boolean): void;
  onPreview(from: CourtPoint | undefined, to: CourtPoint | undefined): void;
  onLaunch(result: LobResult): void;
  isFlying(): boolean;
}

export interface LobPanel {
  aiming(): boolean;
  setAim(p: CourtPoint): void;
  /** Once the flight has played out, say what each warhead did. */
  showResult(r: LobResult): void;
}

const DEG = Math.PI / 180;

function range(
  id: string,
  min: number,
  max: number,
  step: number,
  value: number,
): HTMLInputElement {
  return el('input', {
    id,
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
  });
}

/** Where the needle sits at a moment of the swing: −1 early, 0 the sweet spot, +1 late. */
export function meterPosition(seconds: number): number {
  return -Math.cos((2 * Math.PI * seconds) / METER_PERIOD);
}

export function describeTiming(t: number): string {
  const pct = Math.round(Math.abs(t) * 100);
  if (pct <= 3) return 'Timing: sweet spot.';
  return `Timing: ${String(pct)}% ${t < 0 ? 'early' : 'late'}.`;
}

export function mountLobPanel(host: HTMLElement, hooks: LobPanelHooks): LobPanel {
  let aim: CourtPoint | undefined;
  let aiming = false;
  let swingStart: number | undefined;
  let raf = 0;

  const platform = el('select', { id: 'lob-platform' });
  const warheads = el('input', {
    id: 'lob-warheads',
    type: 'number',
    min: '1',
    value: '1',
    step: '1',
  });
  const bucketNote = el('span', { className: 'panel-note', id: 'lob-bucket' });
  const aimButton = el('button', { type: 'button', id: 'lob-aim' }, ['Aim on the map']);
  const aimNote = el('p', { className: 'panel-note', id: 'lob-aim-note' }, ['No aim point yet.']);
  const elevation = range('lob-elevation', 15, 85, 1, 55);
  const topspin = range('lob-topspin', 0, 3000, 100, 1500);
  const speed = range('lob-speed', 0.1, 70, 0.1, 20);
  const bearing = range('lob-bearing', 0, 359.5, 0.5, 0);
  const out = (id: string): HTMLOutputElement => el('output', { id: `${id}-value` });
  const elevationOut = out('lob-elevation');
  const topspinOut = out('lob-topspin');
  const speedOut = out('lob-speed');
  const bearingOut = out('lob-bearing');
  const needle = el('div', { className: 'meter-needle' });
  const meter = el('div', { className: 'meter', id: 'lob-meter' }, [
    el('span', { className: 'meter-label early' }, ['early']),
    el('div', { className: 'meter-sweet' }),
    needle,
    el('span', { className: 'meter-label late' }, ['late']),
  ]);
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', 'Timing meter');
  const swing = el('button', { type: 'button', id: 'lob-swing', className: 'swing' }, ['Swing']);
  const problems = el('p', { className: 'lob-problems', id: 'lob-problems' });
  problems.setAttribute('role', 'alert');
  const resultTitle = el('h3', { id: 'lob-result-title' });
  const resultLines = el('ul', { id: 'lob-result' });
  const result = el('div', { className: 'lob-result', hidden: true }, [resultTitle, resultLines]);
  result.setAttribute('aria-live', 'polite');

  const gmNote = el('p', { className: 'panel-note' }, [
    'The game-master does not lob. Choose a Combatant under “Viewing as” to take the racquet.',
  ]);
  const row = (label: string, input: HTMLElement, output?: HTMLElement): HTMLElement =>
    el('div', { className: 'lob-row' }, [
      el('label', { htmlFor: input.id }, [label]),
      input,
      ...(output ? [output] : []),
    ]);
  const controls = el('div', { className: 'lob-controls' }, [
    row('Launch from', platform),
    row('Warheads', warheads, bucketNote),
    el('div', { className: 'lob-row' }, [aimButton]),
    aimNote,
    row('Elevation', elevation, elevationOut),
    row('Topspin', topspin, topspinOut),
    row('Racquet pace', speed, speedOut),
    row('Bearing', bearing, bearingOut),
    meter,
    swing,
    problems,
  ]);

  const combatant = (): CombatantId | undefined => {
    const v = getViewer();
    return v.kind === 'combatant' ? v.id : undefined;
  };
  const platforms = (): Platform[] => {
    const id = combatant();
    return id ? platformsFor(id, getState().situation) : [];
  };
  const currentPlatform = (): Platform | undefined =>
    platforms().find((p) => p.id === platform.value);
  const n = (input: HTMLInputElement): number => Number(input.value);

  const showValues = (): void => {
    elevationOut.value = `${elevation.value}°`;
    const tumbling = n(warheads) > 1;
    topspin.disabled = tumbling;
    topspinOut.value = tumbling ? 'none (tumbles)' : `${topspin.value} rpm`;
    speedOut.value = `${n(speed).toFixed(1)} m/s`;
    bearingOut.value = `${n(bearing).toFixed(1)}°`;
  };

  const preview = (): void => {
    const p = currentPlatform();
    hooks.onPreview(p ? project(p.at) : undefined, aim);
  };

  /** Point the racquet at the aim and judge the pace a clean strike needs. */
  const solve = (): void => {
    const p = currentPlatform();
    if (!p || !aim) return;
    const from = project(p.at);
    const lonLat = unproject(aim);
    const km = greatCircleKm(p.at, lonLat);
    const where = territoryAt(lonLat)?.name ?? 'open sea';
    const fix = `${Math.abs(lonLat.lat).toFixed(1)}°${lonLat.lat >= 0 ? 'N' : 'S'} ${Math.abs(lonLat.lon).toFixed(1)}°${lonLat.lon >= 0 ? 'E' : 'W'}`;
    const shot = solveSpeed(
      from,
      aim,
      n(elevation) * DEG,
      n(warheads) > 1 ? 0 : n(topspin),
      n(warheads),
    );
    if (shot) {
      bearing.value = ((shot.bearing / DEG + 360) % 360).toFixed(1);
      speed.value = shot.speed.toFixed(1);
    }
    aimNote.textContent = `Aiming at ${where} (${fix}), about ${Math.round(km).toLocaleString('en-US')} km away.${
      shot ? '' : ' No racquet pace reaches it at this elevation.'
    }`;
    showValues();
  };

  const refresh = (): void => {
    const id = combatant();
    controls.hidden = !id;
    gmNote.hidden = !!id;
    if (!id) {
      setAiming(false);
      hooks.onPreview(undefined, undefined);
      return;
    }
    const list = platforms();
    const keep = platform.value;
    platform.replaceChildren(
      ...list.map((p) => el('option', { value: p.id, selected: p.id === keep }, [p.name])),
    );
    const inBucket = getState().supply.buckets[id] ?? 0;
    warheads.max = String(Math.max(1, Math.min(COMBATANTS[id].mirvCap, inBucket)));
    if (n(warheads) > Number(warheads.max)) warheads.value = warheads.max;
    bucketNote.textContent = `${String(inBucket)} in your bucket; up to ${String(COMBATANTS[id].mirvCap)} per jockstrap`;
    swing.disabled = inBucket === 0;
    showValues();
    preview();
  };

  function setAiming(on: boolean): void {
    aiming = on;
    aimButton.textContent = on ? 'Click the map…' : 'Aim on the map';
    aimButton.setAttribute('aria-pressed', String(on));
    hooks.onAimingChange(on);
  }

  const drawNeedle = (pos: number): void => {
    needle.style.left = `${String(((pos + 1) / 2) * 100)}%`;
    meter.setAttribute('aria-valuenow', pos.toFixed(2));
  };
  drawNeedle(-1);

  const tick = (): void => {
    if (swingStart === undefined) return;
    drawNeedle(meterPosition((performance.now() - swingStart) / 1000));
    raf = requestAnimationFrame(tick);
  };

  const hit = (): void => {
    if (swingStart === undefined) return;
    const timing = meterPosition((performance.now() - swingStart) / 1000);
    swingStart = undefined;
    cancelAnimationFrame(raf);
    drawNeedle(timing);
    swing.textContent = 'Swing';
    const id = combatant();
    const p = currentPlatform();
    if (!id || !p) return;
    const outcome = launch({
      combatant: id,
      platformId: p.id,
      warheads: n(warheads),
      swing: {
        bearing: n(bearing) * DEG,
        elevation: n(elevation) * DEG,
        speed: n(speed),
        topspinRpm: n(warheads) > 1 ? 0 : n(topspin),
        timing,
      },
      ...(aim ? { aimAt: unproject(aim) } : {}),
    });
    if (!outcome.ok) {
      problems.textContent = outcome.problems.join('. ') + '.';
      return;
    }
    problems.textContent = describeTiming(timing);
    swing.disabled = true;
    result.hidden = true;
    hooks.onLaunch(outcome.result);
  };

  swing.addEventListener('click', () => {
    if (swingStart !== undefined) {
      hit();
      return;
    }
    if (hooks.isFlying()) return;
    problems.textContent = '';
    swingStart = performance.now();
    swing.textContent = 'Hit!';
    tick();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && swingStart !== undefined) {
      e.preventDefault();
      hit();
    }
  });
  aimButton.addEventListener('click', () => {
    setAiming(!aiming);
  });
  platform.addEventListener('change', () => {
    preview();
    solve();
  });
  for (const input of [elevation, topspin, warheads]) input.addEventListener('input', solve);
  for (const input of [elevation, topspin, speed, bearing, warheads])
    input.addEventListener('input', showValues);

  onViewerChange(() => {
    aim = undefined;
    aimNote.textContent = 'No aim point yet.';
    result.hidden = true;
    problems.textContent = '';
    refresh();
  });
  onStateChange(refresh);
  refresh();

  host.append(
    el('details', { className: 'panel lob-panel', id: 'lob-panel', open: true }, [
      el('summary', {}, ['The racquet: lob a warhead']),
      gmNote,
      controls,
      result,
    ]),
  );

  return {
    aiming: () => aiming,
    setAim(p) {
      aim = p;
      setAiming(false);
      preview();
      solve();
    },
    showResult(r) {
      const d = describeLob(r);
      resultTitle.textContent = d.title;
      resultLines.replaceChildren(...d.lines.map((l) => el('li', {}, [l])));
      result.hidden = false;
      swing.disabled = (getState().supply.buckets[r.order.combatant] ?? 0) === 0;
    },
  };
}
