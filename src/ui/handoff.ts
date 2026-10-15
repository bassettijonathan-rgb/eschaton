/**
 * The hand-off screen for hot-seat play: before the screen shows one
 * Combatant's secrets, everyone else is asked to look away.
 */
import type { Viewer } from '../engine/buckets';
import { codeOf, defsFor } from '../engine/scenario';
import { el } from './dom';
import { getState } from './store';

export interface HandOff {
  /** Cover the screen and ask for `next` to take it; resolves true once they do, false if cancelled. */
  ask(next: Viewer): Promise<boolean>;
}

export function mountHandOff(host: HTMLElement): HandOff {
  const title = el('h2', { id: 'handoff-title' });
  const note = el('p', {});
  const take = el('button', { type: 'button', id: 'handoff-take', className: 'handoff-take' });
  const cancel = el('button', { type: 'button', id: 'handoff-cancel' }, ['Cancel']);
  const cover = el('div', { className: 'handoff', id: 'handoff', hidden: true }, [
    el('div', { className: 'handoff-card' }, [title, note, take, cancel]),
  ]);
  cover.setAttribute('role', 'dialog');
  cover.setAttribute('aria-modal', 'true');
  cover.setAttribute('aria-labelledby', 'handoff-title');
  host.append(cover);

  let settle: ((ok: boolean) => void) | undefined;
  const finish = (ok: boolean): void => {
    cover.hidden = true;
    settle?.(ok);
    settle = undefined;
  };
  take.addEventListener('click', () => {
    finish(true);
  });
  cancel.addEventListener('click', () => {
    finish(false);
  });

  return {
    ask(next) {
      settle?.(false);
      const ws = getState().situation;
      const names = (
        next.kind === 'gameMaster'
          ? [ws.cast?.gameMaster]
          : (ws.cast?.combatants[next.id] ?? []).map((m) => m?.name)
      ).filter((n): n is string => n !== undefined);
      const who =
        (next.kind === 'gameMaster'
          ? 'the game-master'
          : `${codeOf(ws, next.id)} (${defsFor(ws)[next.id].name})`) +
        (names.length ? `: ${names.join(', ')}` : '');
      title.textContent = `Hand the screen to ${who}`;
      note.textContent =
        next.kind === 'gameMaster'
          ? 'The game-master sees every bucket and every tally.'
          : 'Everyone else, look away: the next screen shows this Combatant’s bucket, profile and messages.';
      take.textContent =
        next.kind === 'gameMaster' ? 'I am the game-master' : `I am ${codeOf(ws, next.id)}`;
      cover.hidden = false;
      take.focus();
      return new Promise((resolve) => {
        settle = resolve;
      });
    },
  };
}
