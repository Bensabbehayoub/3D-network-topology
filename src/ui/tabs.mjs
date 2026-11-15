// Ramy (phase 6) : onglets du panneau « Explications | Recommandations » (index.html).
//
// Motif ARIA « tabs » : un seul onglet actif (aria-selected, tabindex 0), les flèches gauche et
// droite, Début et Fin passent d'un onglet à l'autre, le panneau associé est seul visible.
// Les onglets sont écrits dans index.html (textes fixes) ; ce module ne fait que les relier.

/** Onglet suivant pour une touche du clavier, ou null (fonction pure). */
export function nextTabIndex(key, index, count) {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/**
 * @param {{ querySelectorAll(selector: string): Iterable<object>, getElementById(id: string): object | null }} root
 * @param {string} [selector] onglets à relier
 * @returns {{ select(panelId: string): boolean, selected(): string | null, onChange(listener): () => void }}
 */
export function attachTabs(root, selector = '.panel-tablist [role="tab"]') {
  const tabs = typeof root?.querySelectorAll === 'function' ? [...root.querySelectorAll(selector)] : [];
  const listeners = new Set();
  let current = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.getAttribute('aria-controls') ?? null;

  const select = (panelId, { focus = false } = {}) => {
    const target = tabs.find((tab) => tab.getAttribute('aria-controls') === panelId);
    if (!target) return false;
    for (const tab of tabs) {
      const active = tab === target;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = root.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
    }
    if (focus) target.focus();
    if (current !== panelId) {
      current = panelId;
      for (const listener of [...listeners]) listener(panelId);
    }
    return true;
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab.getAttribute('aria-controls')));
    tab.addEventListener('keydown', (event) => {
      const next = nextTabIndex(event.key, index, tabs.length);
      if (next === null) return;
      event.preventDefault();
      select(tabs[next].getAttribute('aria-controls'), { focus: true });
    });
  });

  return {
    select: (panelId) => select(panelId),
    selected: () => current,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
