// Pôle ui (Ramy) : monte les modules de l'interface dans leurs points de montage.
//
// Contrat fixé par main.js : `init(app)` est appelé après les pôles sim et render.
// - app.sim et app.render peuvent être vides ({}) tant que leurs pôles ne sont pas livrés,
//   ou absents si leur chargement a échoué : l'interface doit rester utilisable sans eux.
// - La valeur renvoyée est l'API publique du pôle ui ; main.js la range dans app.ui.
//
// Le second paramètre ne sert qu'aux tests sous Node (pas de DOM) : main.js ne le passe pas.

import { mount as mountControls } from './controls.js';
import { mount as mountExplanations } from './explanations.js';
import { mount as mountInspector } from './inspector.js';
import { mount as mountScenarioPicker } from './scenarioPicker.js';

/**
 * Id des points de montage déclarés dans index.html.
 * Ce sont des contrats d'équipe : #scene est utilisé par le pôle render (Aziz)
 * et #xr-slot par le pôle xr (Ayoub). Ne pas les renommer sans prévenir l'équipe.
 */
export const MOUNT_POINTS = Object.freeze({
  scene: 'scene',
  controls: 'controls',
  scenarioPicker: 'scenario-picker',
  inspector: 'inspector',
  explanations: 'explanations',
  xr: 'xr-slot',
  install: 'install-slot',
});

// Modules montés par ce pôle, dans l'ordre d'affichage.
// install.js (S5) et selection.js (S2) viendront s'ajouter ici.
const MODULES = [
  { name: 'scenarioPicker', id: MOUNT_POINTS.scenarioPicker, mount: mountScenarioPicker },
  { name: 'controls', id: MOUNT_POINTS.controls, mount: mountControls },
  { name: 'inspector', id: MOUNT_POINTS.inspector, mount: mountInspector },
  { name: 'explanations', id: MOUNT_POINTS.explanations, mount: mountExplanations },
];

/**
 * Démarre l'interface.
 * @param {object} [app] objet partagé rempli par main.js ({ sim, render, ... }).
 * @param {{ root?: { getElementById(id: string): object | null } }} [options]
 * @returns {Promise<{ mountPoints: typeof MOUNT_POINTS, modules: Record<string, object> }>}
 *   API publique du pôle ui :
 *   - mountPoints : les id des points de montage ;
 *   - modules : l'API renvoyée par chaque module monté, rangée par nom.
 *   S2 ajoutera pick(ray) pour la sélection (utilisé aussi par le pôle xr).
 */
export async function init(app = {}, { root = globalThis.document } = {}) {
  const modules = {};

  if (typeof root?.getElementById !== 'function') {
    console.warn('Interface non montée : aucun document disponible.');
    return { mountPoints: MOUNT_POINTS, modules };
  }

  for (const { name, id, mount } of MODULES) {
    const container = root.getElementById(id);
    if (!container) {
      console.warn(`Point de montage #${id} absent : module "${name}" non monté.`);
      continue;
    }
    try {
      modules[name] = mount(container, app ?? {}) ?? {};
    } catch (error) {
      // Un module en panne ne doit pas empêcher les autres de s'afficher.
      console.error(`Module ui "${name}" non monté :`, error);
    }
  }

  return { mountPoints: MOUNT_POINTS, modules };
}
