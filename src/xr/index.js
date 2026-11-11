// Pôle XR (Ayoub) : point d'entrée appelé en dernier par main.js.
// Détection de la WebXR Device API, statut affiché dans #xr-slot.
// S4 : session.js ajoutera le bouton « Entrer en VR » ; S5 : controllers.js.
import { detectXR, mountStatus } from './session.js';

export async function init(app = {}, { root = globalThis.document } = {}) {
  const slot = root?.getElementById?.('xr-slot');
  if (!slot) {
    // Pas de page (tests Node) ou point de montage absent : on détecte sans afficher.
    return { support: await detectXR() };
  }
  const status = await mountStatus(slot);
  return { get support() { return status.getStatus(); } };
}
