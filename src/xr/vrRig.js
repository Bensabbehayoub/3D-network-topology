// Pôle xr : tout ce qui n'existe que pendant une session VR (panneaux 3D et manettes).
//
// Créé à l'entrée en VR, détruit à la sortie : en mode classique, la scène ne contient rien
// de plus. Les objets sont ajoutés à la racine de la scène (repère = espace de référence WebXR,
// en mètres), et non au groupe « monde » qui porte la topologie réduite à l'échelle d'une maquette.

import * as THREE from '../../vendor/three/build/three.webgpu.js';
import { createControllers } from './controllers.js';
import { createVrDevicePanel, createVrStepPanel } from './infoPanels.js';
import { panelPoses } from './panelLayout.js';
import { createVrRecoPanel } from './recoPanel.js';
import { createVrControlPanel } from './vrPanel.js';

/** Le rendu fournit-il ce qu'il faut pour l'interface VR ? */
export function canMountRig(app) {
  const render = app?.render;
  return Boolean(render?.scene && typeof render.onFrame === 'function' && typeof render.getVRAnchor === 'function');
}

/**
 * @param {object} app objet partagé (app.sim, app.render, app.ui)
 * @param {XRSession} session session immersive ouverte
 * @param {{ documentRef?: Document }} [options]
 * @returns {{ dispose(): void } | null} null si le rendu ne permet pas l'interface VR
 */
export function createVrRig(app, session, { documentRef = globalThis.document } = {}) {
  if (!canMountRig(app)) {
    console.warn('Interface VR non montée : app.render.scene, onFrame ou getVRAnchor manquant.');
    return null;
  }
  const { render } = app;
  const group = new THREE.Group();
  group.name = 'Interface VR';
  render.scene.add(group);

  const panels = {
    controls: createVrControlPanel(app, { documentRef }),
    device: createVrDevicePanel(app, { documentRef }),
    step: createVrStepPanel(app, { documentRef }),
    recommendations: createVrRecoPanel(app, { documentRef }),
  };
  for (const panel of Object.values(panels)) group.add(panel.mesh);
  const controllers = createControllers({ app, session, parent: group, panels: Object.values(panels) });

  // Les panneaux suivent la maquette : son ancrage change quand la hauteur du casque est connue
  // (première pose) ou quand un autre scénario est chargé.
  let placedFor = '';
  const place = () => {
    const anchor = render.getVRAnchor();
    if (!anchor) return;
    const key = JSON.stringify(anchor);
    if (key === placedFor) return;
    placedFor = key;
    const poses = panelPoses(anchor);
    for (const [name, panel] of Object.entries(panels)) panel.setPose(poses[name]);
  };
  place();

  const offFrame = render.onFrame((info) => {
    if (!info.presenting) return;
    place();
    controllers.update(info);
  });

  return {
    dispose() {
      offFrame();
      controllers.dispose();
      for (const panel of Object.values(panels)) panel.dispose();
      render.scene.remove(group);
    },
  };
}
