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
import { attachSelection, createSelection, deviceExists, renderHighlighter } from './selection.js';

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
// install.js (S5) viendra s'ajouter ici. selection.js n'a pas de zone à lui : il est créé à part.
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
 * @returns {Promise<object>} API publique du pôle ui (app.ui) :
 *   - mountPoints : les id des points de montage ;
 *   - modules : l'API renvoyée par chaque module monté, rangée par nom ;
 *   - select(id) → boolean : sélectionne un équipement (utilisé aussi par le pôle xr après
 *     son lancer de rayon en VR) ; false si l'id est inconnu ;
 *   - clear() → boolean : retire la sélection ;
 *   - getSelection() → id de l'équipement sélectionné, ou null ;
 *   - onChange(listener) → désabonnement ; listener(id, previous) à chaque changement.
 */
export async function init(app = {}, { root = globalThis.document } = {}) {
  const shared = app ?? {};
  const modules = {};

  // La sélection existe même sans document : le pôle xr peut s'en servir en VR.
  const selection = createSelection({
    highlight: renderHighlighter(shared),
    isKnown: (id) => deviceExists(shared, id),
  });
  const api = {
    mountPoints: MOUNT_POINTS,
    modules,
    select: selection.select,
    clear: selection.clear,
    getSelection: selection.getSelection,
    onChange: selection.onChange,
  };

  try {
    attachSelection(shared, selection, { root, sceneId: MOUNT_POINTS.scene });
  } catch (error) {
    console.error('Sélection non branchée :', error);
  }

  if (typeof root?.getElementById !== 'function') {
    console.warn('Interface non montée : aucun document disponible.');
    return api;
  }

  for (const { name, id, mount } of MODULES) {
    const container = root.getElementById(id);
    if (!container) {
      console.warn(`Point de montage #${id} absent : module "${name}" non monté.`);
      continue;
    }
    try {
      // Troisième paramètre : services partagés entre modules (la sélection pour l'inspecteur).
      modules[name] = mount(container, shared, { selection }) ?? {};
    } catch (error) {
      // Un module en panne ne doit pas empêcher les autres de s'afficher.
      console.error(`Module ui "${name}" non monté :`, error);
    }
  }

  return api;
}
