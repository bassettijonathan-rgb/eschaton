import { el } from './dom';
import type { Description } from './describe';

export interface Inspector {
  show(d: Description): void;
  clear(): void;
}

export function mountInspector(host: HTMLElement): Inspector {
  const title = el('h2', { id: 'inspector-title' });
  const body = el('ul', { id: 'inspector-body' });
  const close = el('button', { type: 'button', className: 'close', ariaLabel: 'Close' }, ['×']);
  const panel = el('aside', { className: 'inspector', id: 'inspector', hidden: true }, [
    close,
    title,
    body,
  ]);
  panel.setAttribute('aria-live', 'polite');
  host.append(panel);
  const clear = (): void => {
    panel.hidden = true;
  };
  close.addEventListener('click', clear);
  return {
    show(d) {
      title.textContent = d.title;
      body.replaceChildren(...d.lines.map((l) => el('li', {}, [l])));
      panel.hidden = false;
    },
    clear,
  };
}
