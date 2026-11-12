// Pôle xr : un panneau VR = un canvas 2D appliqué en texture sur un rectangle 3D.
// Aucune bibliothèque de texte 3D : le canvas du navigateur dessine le texte, Three.js l'affiche.

import * as THREE from '../../vendor/three/build/three.webgpu.js';

/** Couleurs des panneaux, reprises de styles.css pour garder la même identité qu'en 2D. */
export const PALETTE = Object.freeze({
  background: '#182028',
  surface: '#1f2a35',
  border: '#3a4c5e',
  text: '#e6edf3',
  muted: '#9fb0c0',
  accent: '#4ea8ff',
  accentText: '#06121f',
  hover: '#ffd166',
  playing: '#3ddc84',
  danger: '#ff6b6b',
});

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
export const MONO = 'ui-monospace, Consolas, "Liberation Mono", monospace';

/** Rectangle aux coins arrondis (roundRect manque sur d'anciens navigateurs). */
export function roundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
}

/** Fond commun à tous les panneaux. */
export function drawBackground(ctx, layout) {
  ctx.clearRect(0, 0, layout.pxWidth, layout.pxHeight);
  roundedRect(ctx, 4, 4, layout.pxWidth - 8, layout.pxHeight - 8, 28);
  ctx.fillStyle = PALETTE.background;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = PALETTE.border;
  ctx.stroke();
}

/**
 * @param {{ width: number, height: number, pxWidth: number, pxHeight: number }} layout taille en mètres et en pixels
 * @param {{ documentRef?: Document, name?: string }} [options]
 * @returns {{ mesh: THREE.Mesh, ctx: CanvasRenderingContext2D, layout: object,
 *   commit(): void, setPose(pose: { position, yaw, pitch }): void, dispose(): void }}
 */
export function createCanvasPanel(layout, { documentRef = globalThis.document, name = 'panneau VR' } = {}) {
  const canvas = documentRef.createElement('canvas');
  canvas.width = layout.pxWidth;
  canvas.height = layout.pxHeight;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  // Matériau non éclairé : le texte garde ses couleurs quelle que soit la lumière de la scène.
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(layout.width, layout.height), material);
  mesh.name = name;

  return {
    mesh,
    ctx,
    layout,
    /** À appeler après avoir dessiné : envoie le canvas à la carte graphique. */
    commit() { texture.needsUpdate = true; },
    /** Place le panneau : yaw autour de la verticale, pitch = inclinaison vers l'arrière. */
    setPose({ position, yaw = 0, pitch = 0 }) {
      mesh.position.set(position.x, position.y, position.z);
      mesh.rotation.set(-pitch, yaw, 0, 'YXZ');
      mesh.updateMatrixWorld(true);
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
