// Pôle xr : manettes de la session VR.
//
// À chaque image, pour chaque source d'entrée de la session (XRSession.inputSources), on lit
// dans le XRFrame la pose de son espace de visée (targetRaySpace) exprimée dans l'espace de
// référence : c'est le rayon de la manette. Ce rayon est comparé aux panneaux VR (calcul local)
// et aux équipements (lancer de rayon du pôle render : app.render.pickDeviceHit).
//
// Retour visuel : un trait part de la manette et s'arrête sur la cible, une pastille marque le
// point visé, le trait change de couleur sur une cible, l'équipement visé s'éclaire et le bouton
// visé est encadré. Gâchette (évènement « select » de la session) : bouton du panneau exécuté,
// ou équipement sélectionné par app.ui.select(id), qui met à jour la fiche en 2D comme en VR.

import * as THREE from '../../vendor/three/build/three.module.js';
import { RAY_LENGTH, rayFromPose, resolveTarget } from './panelLayout.js';

const IDLE_COLOR = 0x9fb0c0;
const TARGET_COLOR = 0xffd166;
/** Tolérance de visée, en unités de la topologie : passer à cette distance d'un équipement suffit. */
export const AIM_TOLERANCE = 0.7;

/**
 * Décide quoi faire d'une cible quand la gâchette est pressée (fonction pure).
 * @param {ReturnType<typeof resolveTarget>} target
 * @returns {{ type: 'press', index: number, u: number, v: number } | { type: 'select', id: string } | null}
 */
export function selectAction(target) {
  if (!target) return null;
  if (target.kind === 'panel') return { type: 'press', index: target.index, u: target.u, v: target.v };
  return { type: 'select', id: target.id };
}

/**
 * Équipement à éclairer au survol : jamais celui qui est déjà sélectionné (il a sa surbrillance).
 * @returns {{ restore: Array<{ id: string, mode: string }>, light: string | null }}
 */
export function hoverChange(previousId, nextId, selectedId) {
  if (previousId === nextId) return { restore: [], light: null };
  const restore = previousId ? [{ id: previousId, mode: previousId === selectedId ? 'selected' : 'normal' }] : [];
  return { restore, light: nextId && nextId !== selectedId ? nextId : null };
}

/**
 * @param {object} options
 * @param {object} options.app objet partagé (app.render, app.ui)
 * @param {XRSession} options.session session immersive ouverte
 * @param {THREE.Object3D} options.parent groupe où ajouter les rayons (repère = espace de référence)
 * @param {Array<{ getPlane(): object, hover(u: number | null, v?: number): void, press(u: number, v: number): boolean }>} options.panels
 * @returns {{ update(info: { xrFrame: XRFrame | null, referenceSpace: XRReferenceSpace | null }): void, dispose(): void }}
 */
export function createControllers({ app, session, parent, panels }) {
  const render = app?.render;
  const group = new THREE.Group();
  group.name = 'Manettes VR';
  parent.add(group);

  // Un trait de longueur 1 vers +Z (Object3D.lookAt oriente l'axe +Z vers la cible), étiré
  // jusqu'à la cible ; une pastille au point visé.
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)]);
  const dotGeometry = new THREE.SphereGeometry(0.012, 16, 12);
  /** @type {Map<XRInputSource, { line: THREE.Line, dot: THREE.Mesh }>} */
  const visuals = new Map();
  let hoveredDevice = null;

  function visualFor(source) {
    let visual = visuals.get(source);
    if (!visual) {
      const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: IDLE_COLOR }));
      const dot = new THREE.Mesh(dotGeometry, new THREE.MeshBasicMaterial({ color: TARGET_COLOR }));
      line.frustumCulled = false;
      group.add(line, dot);
      visual = { line, dot };
      visuals.set(source, visual);
    }
    return visual;
  }

  function removeVisual(source) {
    const visual = visuals.get(source);
    if (!visual) return;
    group.remove(visual.line, visual.dot);
    visual.line.material.dispose();
    visual.dot.material.dispose();
    visuals.delete(source);
  }

  /** Rayon d'une source d'entrée dans l'espace de référence, ou null si elle n'est pas suivie. */
  function rayOf(source, xrFrame, referenceSpace) {
    if (!source?.targetRaySpace || !xrFrame || !referenceSpace) return null;
    // XRFrame.getPose(espace, espace de base) : null quand le suivi de la manette est perdu.
    const pose = xrFrame.getPose(source.targetRaySpace, referenceSpace);
    return pose ? rayFromPose(pose.transform) : null;
  }

  function targetOf(ray) {
    let deviceHit = null;
    try {
      deviceHit = typeof render?.pickDeviceHit === 'function'
        ? render.pickDeviceHit(ray.origin, ray.direction, { tolerance: AIM_TOLERANCE })
        : null;
    } catch (error) {
      console.error('Lancer de rayon impossible :', error);
    }
    return resolveTarget(ray, panels.map((panel) => panel.getPlane()), deviceHit);
  }

  function setHoveredDevice(id) {
    const change = hoverChange(hoveredDevice, id, app?.ui?.getSelection?.() ?? null);
    hoveredDevice = id;
    if (typeof render?.highlightDevice !== 'function') return;
    try {
      for (const { id: previous, mode } of change.restore) render.highlightDevice(previous, mode);
      if (change.light) render.highlightDevice(change.light, 'active');
    } catch (error) {
      console.error('Surbrillance au survol impossible :', error);
    }
  }

  /** À appeler à chaque image de la session (abonné à app.render.onFrame). */
  function update({ xrFrame, referenceSpace }) {
    const sources = [...(session.inputSources ?? [])];
    for (const source of [...visuals.keys()]) if (!sources.includes(source)) removeVisual(source);

    const panelHover = panels.map(() => null);
    let deviceHover = null;
    for (const source of sources) {
      const ray = rayOf(source, xrFrame, referenceSpace);
      const visual = visualFor(source);
      visual.line.visible = Boolean(ray);
      visual.dot.visible = false;
      if (!ray) continue;

      const target = targetOf(ray);
      const length = target ? target.distance : RAY_LENGTH;
      visual.line.position.set(ray.origin.x, ray.origin.y, ray.origin.z);
      visual.line.lookAt(ray.origin.x + ray.direction.x, ray.origin.y + ray.direction.y, ray.origin.z + ray.direction.z);
      visual.line.scale.set(1, 1, length);
      visual.line.material.color.setHex(target ? TARGET_COLOR : IDLE_COLOR);
      if (target) {
        visual.dot.visible = true;
        visual.dot.position.set(target.point.x, target.point.y, target.point.z);
        if (target.kind === 'panel') panelHover[target.index] = target;
        else deviceHover = target.id;
      }
    }
    panels.forEach((panel, index) => {
      const hit = panelHover[index];
      panel.hover(hit ? hit.u : null, hit?.v);
    });
    setHoveredDevice(deviceHover);
  }

  // « select » : action principale de la manette (gâchette), émise une fois par appui complet.
  // L'évènement porte le XRFrame de l'instant et la source d'entrée : on refait le lancer de rayon
  // avec cette pose exacte plutôt que de réutiliser celle de la dernière image.
  const onSelect = (event) => {
    const referenceSpace = render?.renderer?.xr?.getReferenceSpace?.() ?? null;
    const ray = rayOf(event.inputSource, event.frame, referenceSpace);
    const action = selectAction(ray ? targetOf(ray) : null);
    if (!action) return;
    if (action.type === 'press') panels[action.index].press(action.u, action.v);
    else app?.ui?.select?.(action.id);
  };
  session.addEventListener('select', onSelect);

  return {
    update,
    dispose() {
      session.removeEventListener('select', onSelect);
      setHoveredDevice(null);
      for (const source of [...visuals.keys()]) removeVisual(source);
      parent.remove(group);
      lineGeometry.dispose();
      dotGeometry.dispose();
    },
  };
}
