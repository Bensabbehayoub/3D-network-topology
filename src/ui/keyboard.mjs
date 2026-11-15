// Ramy : règles communes aux raccourcis clavier de l'interface (controls.js, selection.js).

/** Le focus est-il dans un champ où les touches servent à la saisie (raccourcis ignorés) ? */
export function isEditable(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(String(target.tagName ?? '').toUpperCase());
}

/** Touche Espace (« Spacebar » sur les anciens navigateurs). */
export const isSpace = (key) => key === ' ' || key === 'Spacebar';
