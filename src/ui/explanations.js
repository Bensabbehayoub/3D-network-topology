// Ramy : explication de l'étape en cours et journal des messages échangés.
// S1 : message d'attente et journal vide.
// S3 : abonnement au bus d'évènements de app.sim (patron Observer) ; texte de l'étape lu
//      dans le scénario ; une ligne de journal par envoi / réception (écrite avec textContent).

const TEMPLATE = `
  <p class="placeholder">Choisissez un scénario puis lancez la simulation : chaque étape sera expliquée ici.</p>
  <h3 class="sr-only">Journal des messages</h3>
  <ol class="log" aria-label="Journal des messages"></ol>
`;

/**
 * @param {{ innerHTML: string }} container élément #explanations
 * @param {object} app objet partagé
 * @returns {object} API du module
 */
export function mount(container, app) {
  container.innerHTML = TEMPLATE;
  return {};
}
