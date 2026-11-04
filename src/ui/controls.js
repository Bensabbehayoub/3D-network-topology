// Ramy : barre de commandes de la simulation (lecture, pause, pas à pas, vitesse, réinitialisation).
// S1 : structure affichée, boutons désactivés.
// S2 : brancher chaque bouton sur les commandes de app.sim (patron Command, côté moteur).

const TEMPLATE = `
  <button type="button" class="btn btn-primary" data-command="play" disabled>▶ Lecture</button>
  <button type="button" class="btn" data-command="pause" disabled>⏸ Pause</button>
  <button type="button" class="btn" data-command="step" disabled>⏭ Pas à pas</button>
  <label class="field">
    Vitesse
    <input type="range" data-command="speed" min="0.25" max="4" step="0.25" value="1" disabled>
  </label>
  <button type="button" class="btn" data-command="reset" disabled>↺ Réinitialiser</button>
`;

/**
 * @param {{ innerHTML: string }} container élément #controls
 * @param {object} app objet partagé (app.sim sera utilisé en S2)
 * @returns {object} API du module
 */
export function mount(container, app) {
  container.innerHTML = TEMPLATE;
  return {};
}
