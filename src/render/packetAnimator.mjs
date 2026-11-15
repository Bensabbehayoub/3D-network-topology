// Ayoub (S2) : animation des paquets le long des câbles, pilotée par l'horloge simulée.
//
// Règle (point de vigilance n°5 du plan) : la position d'un paquet ne dépend PAS du nombre
// d'images par seconde. À chaque avancée de l'horloge simulée (TOPICS.TICK), on demande au
// moteur les paquets en vol et leur avancement (app.sim.getPacketsInFlight(), contrat S2 de
// Khalil), puis on place chaque paquet à cet avancement entre ses deux équipements.
// Pause, pas à pas, vitesse et réinitialisation restent donc cohérents sans état à tenir ici.
//
// Le calcul des positions (computeFrame) est séparé de l'affichage Three.js : il se teste sous Node.

import * as THREE from '../../vendor/three/build/three.webgpu.js';
import { isBroadcast, TOPICS } from '../../simulation.mjs';
import { colorNumber, packetStyle } from './packetStyles.mjs';

/** Hauteur du repli en ligne droite (aucun câble dessiné) : au-dessus des équipements. */
export const PACKET_HEIGHT = 1.6;

// Couleur par protocole : packetStyles.mjs (phase 4d). Taille : la même pour tous les paquets,
// diffusion comprise (la couleur suffit à les distinguer et un gros paquet masquait le câble).

/** Rayon de tous les paquets (seul le paquet sélectionné dans l'inspecteur est agrandi). */
export const PACKET_RADIUS = 0.3;

/** Point à la fraction `progress` du segment from → to (progress borné entre 0 et 1). */
export function packetPosition(from, to, progress, height = PACKET_HEIGHT) {
  const t = Math.min(1, Math.max(0, progress));
  return {
    x: from.x + (to.x - from.x) * t,
    y: height + from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

/**
 * Point à la fraction `progress` d'une ligne brisée (les points du câble), mesurée en longueur :
 * le paquet garde la même vitesse sur chaque morceau du câble.
 * @param {Array<{ x: number, y: number, z: number }>} points au moins deux points, de la source vers la destination
 */
export function pathPoint(points, progress) {
  const t = Math.min(1, Math.max(0, progress));
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return { ...points[0] };
  let remaining = t * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const a = points[i];
      const b = points[i + 1];
      const f = lengths[i] === 0 ? 0 : Math.min(1, remaining / lengths[i]);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
    }
    remaining -= lengths[i];
  }
  return { ...points[points.length - 1] };
}

/**
 * Tracé d'un câble dessiné dans la scène, exprimé dans le repère de `space` et orienté de
 * `event.source` vers `event.destination`. Le câble est retrouvé par son id (`event.link`),
 * sinon par ses deux extrémités.
 * @param {THREE.Object3D} space groupe qui contient les câbles (et les paquets)
 * @param {{ link?: string | null, source: string, destination: string }} event évènement d'envoi
 * @returns {Array<{ x: number, y: number, z: number }> | null} null si aucun câble ne correspond
 */
export function cablePath(space, event) {
  const layer = space?.getObjectByName?.('Network links');
  if (!layer) return null;
  const lines = layer.children.filter((line) => line.userData);
  const line = lines.find((item) => event.link && item.userData.linkId === event.link)
    ?? lines.find(({ userData: u }) => (u.from === event.source && u.to === event.destination)
      || (u.from === event.destination && u.to === event.source));
  const attribute = line?.geometry?.getAttribute?.('position');
  if (!attribute || attribute.count < 2) return null;
  line.updateWorldMatrix(true, false);
  space.updateWorldMatrix(true, false);
  const points = [];
  for (let i = 0; i < attribute.count; i++) {
    const v = space.worldToLocal(line.localToWorld(new THREE.Vector3().fromBufferAttribute(attribute, i)));
    points.push({ x: v.x, y: v.y, z: v.z });
  }
  // Le câble est dessiné de link.from vers link.to : on l'inverse si le paquet va dans l'autre sens.
  return line.userData.from === event.source ? points : points.reverse();
}

/**
 * Calcule ce qu'il faut afficher maintenant.
 * @param {Array<{ event: object, progress: number }>} inFlight résultat de app.sim.getPacketsInFlight()
 * @param {(deviceId: string) => { x: number, y: number, z: number } | null} getPosition position d'un équipement
 * @param {(event: object) => Array<{ x: number, y: number, z: number }> | null} [getPath] tracé du câble
 *   emprunté, de la source vers la destination ; sans tracé, le paquet va en ligne droite en l'air
 * @returns {Array<{ key: number, packetId: string, protocol: string, type: string, broadcast: boolean,
 *   progress: number, position: { x: number, y: number, z: number } }>}
 *   `key` est l'id de l'évènement d'envoi : un même paquet diffusé sur plusieurs câbles à la fois
 *   (inondation par un switch) donne un objet par câble.
 */
export function computeFrame(inFlight, getPosition, getPath = null) {
  const frame = [];
  for (const { event, progress } of inFlight ?? []) {
    const from = getPosition(event.source);
    const to = getPosition(event.destination);
    if (!from || !to) continue; // équipement absent du rendu : on n'invente pas de trajet
    const path = getPath?.(event);
    frame.push({
      key: event.id,
      packetId: event.packet.id,
      protocol: event.packet.protocol,
      type: event.packet.type,
      broadcast: isBroadcast(event.packet),
      progress,
      position: path?.length >= 2 ? pathPoint(path, progress) : packetPosition(from, to, progress),
    });
  }
  return frame;
}

/**
 * Affiche les paquets en vol dans un groupe Three.js et les tient à jour.
 * @param {{
 *   sim: { on: Function, getPacketsInFlight: Function },
 *   parent: THREE.Object3D,
 *   getPosition: (deviceId: string) => { x: number, y: number, z: number } | null,
 *   getPath?: (event: object) => Array<{ x: number, y: number, z: number }> | null,
 * }} options
 * @returns {{ update(): void, count(): number, getFrame(): ReturnType<typeof computeFrame>, dispose(): void }}
 */
export function createPacketAnimator({ sim, parent, getPosition, getPath = null }) {
  if (typeof sim?.getPacketsInFlight !== 'function') throw new TypeError('sim.getPacketsInFlight() est requis (contrat S2)');
  if (!parent || typeof parent.add !== 'function') throw new TypeError('un groupe Three.js (parent) est requis');

  const group = new THREE.Group();
  group.name = 'packets';
  parent.add(group);

  // Géométrie partagée, un matériau par couleur : quelques objets seulement (performance mobile).
  const geometry = new THREE.SphereGeometry(1, 20, 14);
  /** @type {Map<string, THREE.MeshStandardMaterial>} */
  const materials = new Map();
  const materialFor = (hex) => {
    if (!materials.has(hex)) {
      const color = colorNumber(hex);
      materials.set(hex, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45 }));
    }
    return materials.get(hex);
  };

  /** @type {Map<number, THREE.Mesh>} */
  const meshes = new Map();
  let frame = [];
  /** Évènement d'envoi du paquet sélectionné dans l'inspecteur : dessiné plus gros. */
  let selectedKey = null;
  const SELECTED_SCALE = 1.7;
  let disposed = false;

  function update() {
    if (disposed) return;
    frame = computeFrame(sim.getPacketsInFlight(), getPosition, getPath);
    const seen = new Set();
    for (const item of frame) {
      seen.add(item.key);
      let mesh = meshes.get(item.key);
      if (!mesh) {
        const style = packetStyle(item.protocol, item.broadcast);
        mesh = new THREE.Mesh(geometry, materialFor(style.color));
        mesh.name = `packet-${item.packetId}`;
        mesh.userData = { packetId: item.packetId, protocol: item.protocol, type: item.type, eventId: item.key, radius: PACKET_RADIUS };
        group.add(mesh);
        meshes.set(item.key, mesh);
      }
      mesh.position.set(item.position.x, item.position.y, item.position.z);
      mesh.scale.setScalar(mesh.userData.radius * (item.key === selectedKey ? SELECTED_SCALE : 1));
    }
    // Arrivé, perdu ou effacé par une réinitialisation : il n'est plus en vol, on le retire.
    for (const [key, mesh] of meshes) {
      if (!seen.has(key)) {
        group.remove(mesh);
        meshes.delete(key);
      }
    }
  }

  const unsubscribe = [TOPICS.TICK, TOPICS.RESET, TOPICS.STATE, TOPICS.SCENARIO]
    .map((topic) => sim.on(topic, update))
    .filter((off) => typeof off === 'function');
  update();

  return {
    update,
    count: () => meshes.size,
    /** Met en avant le paquet de l'évènement d'envoi `eventId` (null : aucun). */
    select(eventId) {
      selectedKey = Number.isInteger(eventId) ? eventId : null;
      update();
    },
    getFrame: () => frame,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe.forEach((off) => off());
      parent.remove(group);
      meshes.clear();
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
  };
}

/**
 * Branche l'animateur sur l'application (à appeler depuis src/render/index.mjs, après la scène).
 * Demande au rendu d'exposer `world` (le groupe qui contient la topologie, mis à l'échelle en VR)
 * et `getDevice(id)` (position de chaque équipement).
 * @param {{ sim?: object, render?: object }} app
 * @returns {ReturnType<typeof createPacketAnimator> | null} null si le moteur ou la scène manque
 */
export function mountPacketAnimator(app) {
  const { sim, render } = app ?? {};
  if (typeof sim?.getPacketsInFlight !== 'function' || !render?.world || typeof render.getDevice !== 'function') {
    console.warn('Animation des paquets non branchée : app.sim.getPacketsInFlight, app.render.world ou app.render.getDevice manquant.');
    return null;
  }
  return createPacketAnimator({
    sim,
    parent: render.world,
    getPosition: (id) => render.getDevice(id)?.position ?? null,
    getPath: (event) => cablePath(render.world, event),
  });
}
