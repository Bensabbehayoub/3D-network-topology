// Pôle render : création du renderer Three.js (r187). Rendu 100 % WebGPU.
//
// Décision (docs/decision-renderer.md) : WebGPURenderer sur son backend WebGPU, en mode classique
// comme en VR. Aucun contexte WebGL n'est jamais créé :
// - le repli WebGL 2 de WebGPURenderer n'est jamais déclenché : sans WebGPU (pas de navigator.gpu
//   ou pas d'adaptateur), on refuse de créer le renderer et la page affiche « WebGPU requis » ;
// - en VR, Three.js rend chaque œil en WebGPU par XRGPUBinding : celui du navigateur sur un vrai
//   casque, ou le pont de xrBridge.js dans Immersive Web Emulator.
//
// Les règles sont des fonctions pures (testées sous Node) ; createRenderer touche au navigateur.

import { SRGBColorSpace, WebGPURenderer } from '../../vendor/three/build/three.webgpu.js';
import { installXRGPUBridge } from './xrBridge.js';

export const BACKEND = 'WebGPU';

/** Message affiché quand le navigateur ne fournit pas WebGPU. */
export const WEBGPU_REQUIRED_MESSAGE = 'Cette application nécessite WebGPU. Ouvrez-la dans Chrome ou Edge récents (version 113 ou plus) sur un ordinateur ou un téléphone compatible.';

/** Erreur levée quand WebGPU manque : la page affiche son message à la place de la scène. */
export class WebGPUUnavailableError extends Error {
  constructor(detail) {
    super(`${WEBGPU_REQUIRED_MESSAGE} (${detail})`);
    this.name = 'WebGPUUnavailableError';
    this.detail = detail;
  }
}

/**
 * Raison pour laquelle WebGPU est indisponible, ou null s'il l'est.
 * @param {{ gpu: boolean, adapter: boolean }} probe
 */
export function webgpuMissingReason({ gpu, adapter }) {
  if (!gpu) return 'navigator.gpu absent';
  if (!adapter) return 'aucun adaptateur WebGPU (carte graphique non prise en charge ou désactivée)';
  return null;
}

/** Le renderer est-il bien sur son backend WebGPU ? */
export function isWebGPU(renderer) {
  return renderer?.backend?.isWebGPUBackend === true;
}

/** Fonctionnalités de session VR à demander en plus : « webgpu », pour la voie native. */
export function extraSessionFeatures() {
  return ['webgpu'];
}

/**
 * Vérifie que le navigateur fournit WebGPU, avant de créer le renderer : WebGPURenderer, lui,
 * basculerait en silence sur WebGL 2.
 * @throws {WebGPUUnavailableError}
 */
export async function assertWebGPU(env = globalThis) {
  const gpu = env.navigator?.gpu;
  let adapter = null;
  if (gpu) {
    try {
      adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    } catch {
      adapter = null;
    }
  }
  const reason = webgpuMissingReason({ gpu: Boolean(gpu), adapter: Boolean(adapter) });
  if (reason) throw new WebGPUUnavailableError(reason);
}

/**
 * Crée et initialise le renderer de la scène (mode classique et WebXR).
 * @param {{ pixelRatio?: number }} [options]
 * @returns {Promise<WebGPURenderer>}
 * @throws {WebGPUUnavailableError} sans WebGPU
 */
export async function createRenderer({ pixelRatio = 1 } = {}) {
  await assertWebGPU();
  installXRGPUBridge(); // avant new WebGPURenderer : Three.js cherche XRGPUBinding à la construction
  const renderer = new WebGPURenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  await renderer.init();
  if (!isWebGPU(renderer)) {
    // Ne devrait pas arriver après assertWebGPU ; on ne garde jamais le repli WebGL.
    renderer.dispose();
    throw new WebGPUUnavailableError("l'initialisation WebGPU a échoué");
  }
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = SRGBColorSpace;
  // WebXR : la même scène et le même renderer servent au mode classique et à la VR.
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  canvas.dataset.backend = BACKEND;
  return renderer;
}
