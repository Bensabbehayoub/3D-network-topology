// Pôle render : pont WebGPU ↔ WebXR pour Immersive Web Emulator (rendu VR 100 % WebGPU).
//
// Three.js r187 rend une session VR en WebGPU par l'API XRGPUBinding (WebXR/WebGPU Binding) et la
// fonctionnalité de session « webgpu ». Sur un vrai casque dont le navigateur les fournit, le pont
// ne fait rien : Three.js utilise l'API du navigateur.
// L'émulateur (IWER, moteur de l'extension Immersive Web Emulator) ne connaît pas cette API. Le pont
// la fournit pour ses sessions seulement :
//   1. XRGPUBinding : chaque œil est rendu par WebGPURenderer dans une tranche d'une texture WebGPU,
//      exactement comme sur un casque ;
//   2. après chaque image, les tranches sont copiées (commandes WebGPU) dans un canevas WebGPU ;
//   3. l'émulateur n'avance ses images et n'affiche un canevas que si la session a une couche de type
//      XRWebGLLayer. On lui en donne une dont le « contexte » est une simple surface (taille du
//      canevas et quelques constantes) : aucun contexte WebGL n'est créé. Il affiche alors notre
//      canevas WebGPU dans sa vue du casque.
//
// Le pont s'appuie sur le fonctionnement de Three.js r187 et d'IWER 2.8 : à revérifier si l'un des
// deux change de version (docs/decision-renderer.md).
// Les calculs (taille des yeux, copies) sont des fonctions pures testées sous Node (xrBridge.test.mjs).

/** Constantes WebGL lues par l'émulateur sur le contexte de la couche (valeurs de la norme WebGL). */
const GL = Object.freeze({
  COLOR_CLEAR_VALUE: 0x0c22, DEPTH_CLEAR_VALUE: 0x0b73, STENCIL_CLEAR_VALUE: 0x0b91,
  COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100, STENCIL_BUFFER_BIT: 0x0400,
});

/** Sessions ouvertes par l'émulateur et prises en charge par le pont → état de la présentation. */
const bridged = new WeakMap();

/** La session a-t-elle la fonctionnalité « webgpu » accordée par le navigateur lui-même ? */
export function hasNativeWebGPUFeature(session) {
  return Array.from(session?.enabledFeatures ?? []).includes('webgpu');
}

/**
 * Zone d'un œil dans sa tranche de texture. L'émulateur calcule la projection de chaque œil avec les
 * proportions de son canevas (la moitié en stéréo) : on donne à l'image la même largeur relative,
 * sinon elle serait étirée. Rapport largeur/hauteur d'une projection = m[5] / m[0].
 * @param {ArrayLike<number>} projectionMatrix matrice 4×4 de la vue (ordre colonnes)
 * @param {number} textureWidth largeur de la tranche (celle du canevas)
 * @param {number} textureHeight hauteur de la tranche
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function eyeViewport(projectionMatrix, textureWidth, textureHeight) {
  const aspect = Math.abs(projectionMatrix?.[5] / projectionMatrix?.[0]);
  const ideal = Number.isFinite(aspect) && aspect > 0 ? Math.round(textureHeight * aspect) : textureWidth;
  return { x: 0, y: 0, width: Math.max(1, Math.min(textureWidth, ideal)), height: textureHeight };
}

/**
 * Copies d'une image vers le canevas affiché : les yeux côte à côte s'ils tiennent dans la largeur
 * (émulateur en stéréo), sinon l'œil gauche seul (émulateur en mono, qui fournit quand même deux vues).
 * @param {Array<{ eye: string, layer: number, width: number, height: number }>} eyes vues rendues
 * @param {{ width: number, height: number }} target taille du canevas
 * @returns {Array<{ layer: number, x: number, width: number, height: number }>}
 */
export function presentationCopies(eyes, target) {
  const ordered = [...eyes].sort((a, b) => a.layer - b.layer);
  const total = ordered.reduce((sum, eye) => sum + eye.width, 0);
  const shown = ordered.length > 1 && total > target.width ? ordered.slice(0, 1) : ordered;
  const copies = [];
  let x = 0;
  for (const eye of shown) {
    const width = Math.min(eye.width, target.width - x);
    const height = Math.min(eye.height, target.height);
    if (width > 0 && height > 0) copies.push({ layer: eye.layer, x, width, height });
    x += eye.width;
  }
  return copies;
}

/**
 * Surface remise à l'émulateur à la place d'un contexte WebGL : il y lit la taille du canevas
 * (proportions des yeux) et y efface l'image (sans effet ici : WebGPU efface à chaque rendu).
 * Toute autre méthode demandée est une fonction vide : aucun contexte WebGL n'existe.
 */
export function emulatorSurface(canvas) {
  const surface = {
    canvas,
    get drawingBufferWidth() { return canvas.width; },
    get drawingBufferHeight() { return canvas.height; },
    ...GL,
    getParameter: (name) => (name === GL.COLOR_CLEAR_VALUE ? [0, 0, 0, 0] : name === GL.DEPTH_CLEAR_VALUE ? 1 : 0),
  };
  return new Proxy(surface, { get: (object, key) => (key in object ? object[key] : () => {}) });
}

/** Couche de projection du pont : une texture WebGPU à deux tranches (œil gauche, œil droit). */
class BridgeProjectionLayer {
  constructor(texture, width, height) {
    this.texture = texture;
    this.textureWidth = width;
    this.textureHeight = height;
    this.textureArrayLength = 2;
    this.ignoreDepthValues = true;
  }
}

/**
 * Installe XRGPUBinding avant la création du renderer (Three.js le cherche à ce moment-là).
 * Les sessions du navigateur passent à son XRGPUBinding s'il existe ; celles de l'émulateur au pont.
 * @param {object} [env] globalThis par défaut
 */
export function installXRGPUBridge(env = globalThis) {
  if (env.XRGPUBinding?.isTopologyBridge) return;
  const Native = env.XRGPUBinding;
  class XRGPUBindingBridge {
    static isTopologyBridge = true;
    constructor(session, device) {
      if (!bridged.has(session)) {
        if (!Native) throw new TypeError('XRGPUBinding indisponible pour cette session');
        return new Native(session, device);
      }
      this.state = bridged.get(session);
      this.state.device = device;
    }
    get nativeProjectionScaleFactor() { return 1; }
    getPreferredColorFormat() { return env.navigator.gpu.getPreferredCanvasFormat(); }
    createProjectionLayer({ colorFormat } = {}) {
      const { state } = this;
      const format = colorFormat ?? this.getPreferredColorFormat();
      // Même taille que celle que l'émulateur donnera au canevas (fenêtre, en pixels CSS).
      const width = Math.max(1, Math.round(env.innerWidth));
      const height = Math.max(1, Math.round(env.innerHeight));
      state.canvas.width = width;
      state.canvas.height = height;
      state.texture?.destroy();
      state.texture = state.device.createTexture({
        size: [width, height, 2], format,
        usage: env.GPUTextureUsage.RENDER_ATTACHMENT | env.GPUTextureUsage.COPY_SRC | env.GPUTextureUsage.TEXTURE_BINDING,
      });
      state.context = state.canvas.getContext('webgpu');
      state.context.configure({ device: state.device, format, alphaMode: 'opaque',
        usage: env.GPUTextureUsage.COPY_DST | env.GPUTextureUsage.RENDER_ATTACHMENT });
      state.layer = new BridgeProjectionLayer(state.texture, width, height);
      return state.layer;
    }
    getViewSubImage(layer, view) {
      const layerIndex = view.eye === 'right' ? 1 : 0;
      const viewport = eyeViewport(view.projectionMatrix, layer.textureWidth, layer.textureHeight);
      this.state.eyes.set(layerIndex, { eye: view.eye, layer: layerIndex, width: viewport.width, height: viewport.height });
      return {
        colorTexture: layer.texture,
        viewport,
        getViewDescriptor: () => ({ dimension: '2d', baseArrayLayer: layerIndex, arrayLayerCount: 1 }),
      };
    }
  }
  env.XRGPUBinding = XRGPUBindingBridge;
}

/** Copie les yeux rendus pendant l'image dans le canevas affiché par l'émulateur. */
function present(state) {
  if (!state.context || !state.texture || state.eyes.size === 0) return;
  const target = state.context.getCurrentTexture();
  const copies = presentationCopies([...state.eyes.values()], { width: target.width, height: target.height });
  state.eyes.clear();
  if (copies.length === 0) return;
  const encoder = state.device.createCommandEncoder();
  for (const copy of copies) {
    encoder.copyTextureToTexture(
      { texture: state.texture, origin: { x: 0, y: 0, z: copy.layer } },
      { texture: target, origin: { x: copy.x, y: 0, z: 0 } },
      [copy.width, copy.height, 1],
    );
  }
  state.device.queue.submit([encoder.finish()]);
}

/**
 * Prépare une session VR à être rendue en WebGPU, avant renderer.xr.setSession(session).
 * @returns {'natif' | 'pont émulateur'} voie utilisée
 * @throws si la session ne peut être rendue en WebGPU (navigateur réel sans XRGPUBinding)
 */
export function prepareXRSession(session, env = globalThis) {
  if (hasNativeWebGPUFeature(session)) return 'natif';
  if (!env.navigator?.gpu) throw new Error('VR impossible : WebGPU indisponible');
  const doc = env.document;
  const canvas = doc.createElement('canvas');
  canvas.className = 'xr-webgpu-view';
  canvas.style.cssText = 'display:block;width:100%;height:100%;background:#000';
  let baseLayer;
  try {
    // Seule la couche de l'émulateur accepte une surface : celle d'un vrai navigateur exige un
    // contexte WebGL, qu'on ne crée pas.
    baseLayer = new env.XRWebGLLayer(session, emulatorSurface(canvas));
  } catch (error) {
    throw new Error(`VR en WebGPU non prise en charge par ce navigateur (XRGPUBinding absent) : ${error.message}`);
  }
  const state = { canvas, device: null, texture: null, context: null, layer: null, eyes: new Map() };
  bridged.set(session, state);

  // Three.js n'ouvre la voie WebGPU que si la session annonce « webgpu ».
  Object.defineProperty(session, 'enabledFeatures', {
    configurable: true,
    value: Object.freeze([...Array.from(session.enabledFeatures ?? []), 'webgpu']),
  });
  // La couche WebGPU reste au pont ; l'émulateur reçoit la couche-surface qui cadence ses images.
  const updateRenderState = session.updateRenderState.bind(session);
  session.updateRenderState = (renderState = {}) => {
    const { layers, ...rest } = renderState;
    if (layers?.some((layer) => layer instanceof BridgeProjectionLayer)) return updateRenderState({ ...rest, baseLayer });
    return updateRenderState(renderState);
  };
  // Après chaque image rendue par Three.js, on la présente.
  const requestAnimationFrame = session.requestAnimationFrame.bind(session);
  session.requestAnimationFrame = (callback) => requestAnimationFrame((time, frame) => {
    try {
      callback(time, frame);
    } finally {
      present(state);
    }
  });
  session.addEventListener('end', () => {
    state.texture?.destroy();
    state.context?.unconfigure?.();
    canvas.remove();
    bridged.delete(session);
  });
  return 'pont émulateur';
}
