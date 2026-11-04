// Ramy : inspecteur de paquet.
// S1 : message d'attente.
// S3 : afficher les champs renvoyés par describe(packet) du protocole du paquet sélectionné
//      (MAC, IP, ports, TTL, indicateurs, contenu simplifié). Écrire les valeurs avec textContent,
//      jamais innerHTML, car elles viennent des scénarios.

const TEMPLATE = `
  <p class="placeholder">Sélectionnez un paquet dans la scène pour afficher ses champs (MAC, IP, TTL, type…).</p>
`;

/**
 * @param {{ innerHTML: string }} container élément #inspector
 * @param {object} app objet partagé
 * @returns {object} API du module
 */
export function mount(container, app) {
  container.innerHTML = TEMPLATE;
  return {};
}
