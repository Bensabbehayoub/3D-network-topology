// Placement de la topologie en VR (fonctions pures, testées sous Node).
//
// En mode classique, la topologie est à l'échelle 1 (une dizaine d'unités de large) et la caméra
// tourne autour. En VR, une unité vaut un mètre : on réduit donc la topologie à la taille d'une
// maquette posée sur une table, devant l'utilisateur, un peu sous la hauteur de ses yeux.

/** Largeur visée de la maquette (m) : tient dans le champ de vision à bout de bras. */
export const VR_TARGET_SIZE = 1.5;
export const VR_MIN_SCALE = 0.04;
export const VR_MAX_SCALE = 0.3;
/** Distance entre l'utilisateur et le centre de la maquette (m). */
export const VR_DISTANCE = 1.35;
/** La maquette est posée à cette distance sous les yeux (m) : on la regarde légèrement de haut. */
export const VR_EYE_DROP = 0.6;
/** Hauteur des yeux supposée tant que la pose du casque n'est pas connue (m, debout). */
export const DEFAULT_EYE_HEIGHT = 1.6;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Boîte englobante (au sol) des équipements.
 * @param {Array<{ position: { x: number, y: number, z: number } }>} devices
 * @returns {{ centerX: number, centerZ: number, width: number, depth: number }}
 */
export function topologyBounds(devices) {
  const points = (devices ?? []).map((device) => device?.position).filter(Boolean);
  if (points.length === 0) return { centerX: 0, centerZ: 0, width: 0, depth: 0 };
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  return { centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ };
}

/**
 * Échelle et position du groupe « monde » pendant une session VR.
 * @param {ReturnType<typeof topologyBounds>} bounds
 * @param {number} [eyeHeight] hauteur des yeux dans l'espace de référence (pose du casque)
 * @returns {{ scale: number, position: { x: number, y: number, z: number },
 *   anchor: { x: number, y: number, z: number, width: number, depth: number } }}
 *   anchor : centre et taille de la maquette, en mètres, pour y accrocher les panneaux VR
 */
export function vrPlacement(bounds, eyeHeight = DEFAULT_EYE_HEIGHT) {
  const eye = Number.isFinite(eyeHeight) ? eyeHeight : DEFAULT_EYE_HEIGHT;
  // +2 : marge pour les équipements eux-mêmes et leurs étiquettes, autour de leurs centres.
  const extent = Math.max(bounds.width, bounds.depth) + 2;
  const scale = clamp(VR_TARGET_SIZE / extent, VR_MIN_SCALE, VR_MAX_SCALE);
  const anchor = {
    x: 0,
    y: clamp(eye - VR_EYE_DROP, -1, 1.4),
    z: -VR_DISTANCE,
    width: (bounds.width + 2) * scale,
    depth: (bounds.depth + 2) * scale,
  };
  return {
    scale,
    // Le centre de la topologie (centerX, 0, centerZ) arrive sur le point d'ancrage.
    position: { x: anchor.x - bounds.centerX * scale, y: anchor.y, z: anchor.z - bounds.centerZ * scale },
    anchor,
  };
}

/**
 * Durée écoulée entre deux images de la boucle d'animation.
 * @param {number | null} previous horodatage de l'image précédente (ms), null pour la première
 * @param {number} time horodatage de l'image courante (ms)
 */
export function frameDelta(previous, time) {
  if (previous === null || !Number.isFinite(previous) || !Number.isFinite(time)) return 0;
  return Math.max(0, time - previous);
}
