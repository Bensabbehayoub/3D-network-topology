// Pôle xr : appelé en dernier par main.js, après sim, render et ui.
//
// - session.mjs : détection de la WebXR Device API, statut HTML dans #xr-slot, entrée et sortie
//   de la session immersive-vr (app.render.startXR).
// - vrRig.mjs : interface de la session VR, créée à l'entrée et détruite à la sortie :
//   panneau de commandes (vrPanel.mjs), fiche d'équipement et explications (infoPanels.mjs),
//   rayons et sélection à la manette (controllers.mjs).
// Sans WebXR, rien de tout cela n'est créé : l'application reste en mode 2D.
import { mount } from './session.mjs';
import { createVrRig } from './vrRig.mjs';

export { detectCapabilities, describeStatus, capabilityRows } from './session.mjs';

/**
 * @param {object} [app] objet partagé rempli par main.js
 * @returns {Promise<object>} API du pôle xr (getCapabilities, getStatus, enter, exit, isPresenting)
 */
export async function init(app = {}) {
  const container = globalThis.document?.getElementById('xr-slot');
  if (!container) return { available: false };

  let rig = null;
  const hooks = {
    onSessionStart(session) {
      rig?.dispose();
      rig = createVrRig(app, session);
    },
    onSessionEnd() {
      rig?.dispose();
      rig = null;
    },
  };
  return { available: true, ...(await mount(container, app, globalThis, hooks)) };
}
