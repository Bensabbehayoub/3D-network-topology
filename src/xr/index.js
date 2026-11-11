// Pôle xr (Ayoub) : appelé en dernier par main.js, après sim, render et ui.
//
// S1 (retours du superviseur) : détection de la WebXR Device API et statut HTML dans #xr-slot,
// bouton « Entrer en VR » branché sur la scène Three.js (app.render.startXR).
// S4 : vrPanel.js (commandes en 3D). S5 : controllers.js (sélection à la manette).
import { mount } from './session.js';

export { detectCapabilities, describeStatus, capabilityRows } from './session.js';

/**
 * @param {object} [app] objet partagé rempli par main.js
 * @returns {Promise<object>} API du pôle xr (getCapabilities, getStatus, enter, exit, isPresenting)
 */
export async function init(app = {}) {
  const container = globalThis.document?.getElementById('xr-slot');
  if (!container) return { available: false };
  return { available: true, ...(await mount(container, app)) };
}
