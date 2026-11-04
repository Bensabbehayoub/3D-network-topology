// Ramy : choix du scénario à jouer.
// S1 : liste désactivée.
// S4 : remplir la liste à partir des scénarios disponibles (scenarios/*.json) et demander
//      au moteur (app.sim) de charger celui qui est choisi.

const TEMPLATE = `
  <label class="field">
    Scénario
    <select disabled>
      <option>Aucun scénario disponible pour l'instant</option>
    </select>
  </label>
`;

/**
 * @param {{ innerHTML: string }} container élément #scenario-picker
 * @param {object} app objet partagé
 * @returns {object} API du module
 */
export function mount(container, app) {
  container.innerHTML = TEMPLATE;
  return {};
}
