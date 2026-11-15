// Ramy (phase 7) : bascule « Explorer | Construire » dans l'en-tête.
//
// Explorer : choisir un scénario fourni et le jouer. Construire : éditeur de topologie (editor.js).
// Deux boutons à bascule (aria-pressed) ; le changement de mode est confié au service `mode`
// fourni par index.js, qui prévient l'éditeur, le rendu et la mise en page.

export const MODES = Object.freeze({ explore: 'Explorer', build: 'Construire' });

const TEMPLATE = `
  <div class="mode-switch" role="group" aria-label="Mode de l'application">
    <button type="button" class="mode-button" data-mode="explore" aria-pressed="true">Explorer</button>
    <button type="button" class="mode-button" data-mode="build" aria-pressed="false">Construire</button>
  </div>
`;

/**
 * @param {object} container élément #mode-slot
 * @param {object} app objet partagé
 * @param {{ mode?: { get(): string, set(mode: string): Promise<boolean> | boolean, onChange(listener): () => void } }} [services]
 */
export function mount(container, app, { mode = null } = {}) {
  container.innerHTML = TEMPLATE;
  const hasDom = typeof container.querySelectorAll === 'function';
  const buttons = hasDom ? [...container.querySelectorAll('[data-mode]')] : [];
  const render = (current) => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.mode === current));
  };
  const onClick = (event) => {
    const target = event.target?.closest?.('[data-mode]');
    if (target) mode?.set(target.dataset.mode);
  };
  if (hasDom) container.addEventListener('click', onClick);
  const off = mode?.onChange?.(render);
  render(mode?.get?.() ?? 'explore');
  return {
    dispose() {
      off?.();
      if (hasDom) container.removeEventListener('click', onClick);
    },
  };
}

/**
 * Service de mode : prévient l'éditeur, le rendu (glisser, toucher du sol), les onglets et la
 * mise en page (attribut data-mode du <body>, lu par styles.css).
 * @param {{ getEditor(): object | null, render?: object, tabs?: object | null, body?: object | null }} deps
 */
export function createModeService({ getEditor, render = null, tabs = null, body = null }) {
  let current = 'explore';
  const listeners = new Set();
  return {
    get: () => current,
    async set(next) {
      if (!MODES[next] || next === current) return false;
      current = next;
      if (body?.dataset) body.dataset.mode = next;
      render?.setEditMode?.(next === 'build');
      const editor = getEditor();
      if (next === 'build') {
        await editor?.enter?.();
        tabs?.select?.('recommendations'); // diagnostic en direct pendant la construction
      } else {
        await editor?.leave?.();
        tabs?.select?.('explanations');
      }
      for (const listener of [...listeners]) listener(next);
      return true;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
