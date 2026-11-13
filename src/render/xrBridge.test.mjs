// Tests du pont WebGPU ↔ WebXR de l'émulateur (src/render/xrBridge.js), sans navigateur :
// calculs purs et comportement avec de faux objets WebXR/WebGPU. Le rendu réel est vérifié dans
// Chrome avec IWER (docs/decision-renderer.md).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emulatorSurface, eyeViewport, hasNativeWebGPUFeature, installXRGPUBridge, prepareXRSession, presentationCopies } from './xrBridge.js';

/** Matrice de projection (ordre colonnes) de rapport largeur/hauteur `aspect`. */
const projection = (aspect, f = 1.5) => [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0];

test('largeur de l\'œil : mêmes proportions que la projection de l\'émulateur', () => {
  // Émulateur en stéréo, canevas 1366×800 : chaque œil a la moitié de la largeur.
  assert.deepEqual(eyeViewport(projection(683 / 800), 1366, 800), { x: 0, y: 0, width: 683, height: 800 });
  // Émulateur en mono : chaque vue a les proportions du canevas entier.
  assert.equal(eyeViewport(projection(1366 / 800), 1366, 800).width, 1366);
  // Jamais plus large que la texture, jamais nul ; matrice illisible → largeur entière.
  assert.equal(eyeViewport(projection(4), 1366, 800).width, 1366);
  assert.equal(eyeViewport(projection(1e-6), 1366, 800).width, 1);
  assert.equal(eyeViewport([0, 0, 0, 0, 0, 1], 1366, 800).width, 1366);
  assert.equal(eyeViewport(undefined, 640, 480).width, 640);
});

test('présentation : yeux côte à côte en stéréo, œil gauche seul en mono', () => {
  const target = { width: 1366, height: 800 };
  assert.deepEqual(presentationCopies([
    { eye: 'right', layer: 1, width: 683, height: 800 },
    { eye: 'left', layer: 0, width: 683, height: 800 },
  ], target), [{ layer: 0, x: 0, width: 683, height: 800 }, { layer: 1, x: 683, width: 683, height: 800 }]);
  assert.deepEqual(presentationCopies([
    { eye: 'left', layer: 0, width: 1366, height: 800 },
    { eye: 'right', layer: 1, width: 1366, height: 800 },
  ], target), [{ layer: 0, x: 0, width: 1366, height: 800 }]);
  // Canevas redimensionné plus petit que l'image : la copie est rognée, jamais hors limites.
  assert.deepEqual(presentationCopies([{ eye: 'none', layer: 0, width: 1366, height: 800 }], { width: 1000, height: 600 }),
    [{ layer: 0, x: 0, width: 1000, height: 600 }]);
  assert.deepEqual(presentationCopies([], target), []);
});

test('surface remise à l\'émulateur : taille du canevas, constantes, aucune méthode WebGL réelle', () => {
  const canvas = { width: 1366, height: 800 };
  const surface = emulatorSurface(canvas);
  assert.equal(surface.canvas, canvas);
  assert.equal(surface.drawingBufferWidth, 1366);
  canvas.width = 900;
  assert.equal(surface.drawingBufferWidth, 900, 'suit le canevas');
  assert.deepEqual(surface.getParameter(surface.COLOR_CLEAR_VALUE), [0, 0, 0, 0]);
  assert.equal(surface.getParameter(surface.DEPTH_CLEAR_VALUE), 1);
  assert.equal(surface.clear(surface.COLOR_BUFFER_BIT), undefined, 'les appels de dessin sont sans effet');
  assert.equal(typeof surface.anythingElse, 'function');
});

test('fonctionnalité « webgpu » accordée par le navigateur → voie native, session intacte', () => {
  const session = { enabledFeatures: ['local-floor', 'webgpu'] };
  assert.equal(hasNativeWebGPUFeature(session), true);
  assert.equal(prepareXRSession(session, {}), 'natif');
  assert.deepEqual(session.enabledFeatures, ['local-floor', 'webgpu']);
  assert.equal(hasNativeWebGPUFeature({}), false);
});

/** Faux environnement : navigateur avec WebGPU, session de l'émulateur. */
function fakeEmulator({ layerAcceptsSurface = true } = {}) {
  const calls = { submit: 0, copies: [], renderStates: [] };
  const env = {
    innerWidth: 1366, innerHeight: 800,
    GPUTextureUsage: { RENDER_ATTACHMENT: 16, COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4 },
    navigator: { gpu: { getPreferredCanvasFormat: () => 'bgra8unorm' } },
    document: {
      createElement: () => ({
        style: {}, width: 300, height: 150, remove() { this.removed = true; },
        getContext(type) {
          assert.equal(type, 'webgpu', 'le canevas de présentation est WebGPU');
          return { configure: (options) => { calls.configure = options; }, unconfigure() {}, getCurrentTexture: () => ({ width: 1366, height: 800 }) };
        },
      }),
    },
    XRWebGLLayer: class {
      constructor(session, context) {
        if (!layerAcceptsSurface) throw new TypeError("parameter 2 is not of type 'WebGLRenderingContext'");
        this.context = context;
      }
    },
  };
  const listeners = {};
  let pending = null;
  const session = {
    enabledFeatures: ['local-floor'],
    updateRenderState: (state) => { calls.renderStates.push(state); },
    requestAnimationFrame: (callback) => { pending = callback; return 7; },
    addEventListener: (type, listener) => { listeners[type] = listener; },
  };
  const device = {
    createTexture: (descriptor) => ({ descriptor, destroy() { this.destroyed = true; } }),
    createCommandEncoder: () => ({ copyTextureToTexture: (source, destination, size) => calls.copies.push({ z: source.origin.z, x: destination.origin.x, size }), finish: () => ({}) }),
    queue: { submit: () => { calls.submit += 1; } },
  };
  return { env, session, device, calls, runFrame: (time, frame) => pending(time, frame), end: () => listeners.end?.() };
}

test('session de l\'émulateur : « webgpu » annoncé, couche-surface remise, images présentées en WebGPU', () => {
  const { env, session, device, calls, runFrame, end } = fakeEmulator();
  installXRGPUBridge(env);
  assert.equal(env.XRGPUBinding.isTopologyBridge, true);
  installXRGPUBridge(env); // idempotent
  assert.equal(prepareXRSession(session, env), 'pont émulateur');
  assert.deepEqual([...session.enabledFeatures], ['local-floor', 'webgpu']);

  // Ce que fait Three.js r187 (_initWebGPUSession, puis une image).
  const binding = new env.XRGPUBinding(session, device);
  const layer = binding.createProjectionLayer({ colorFormat: binding.getPreferredColorFormat() });
  assert.deepEqual(layer.texture.descriptor.size, [1366, 800, 2]);
  assert.equal(calls.configure.format, 'bgra8unorm');
  session.updateRenderState({ layers: [layer] });
  assert.equal(calls.renderStates.length, 1);
  assert.ok(calls.renderStates[0].baseLayer instanceof env.XRWebGLLayer, 'l\'émulateur reçoit une couche-surface');
  assert.equal('layers' in calls.renderStates[0], false);
  assert.equal(calls.renderStates[0].baseLayer.context.canvas.width, 1366);

  assert.equal(session.requestAnimationFrame((time) => {
    // Rendu des deux yeux (émulateur en stéréo : demi-largeur chacun).
    for (const eye of ['left', 'right']) {
      const sub = binding.getViewSubImage(layer, { eye, projectionMatrix: projection(683 / 800) });
      assert.equal(sub.colorTexture, layer.texture);
      assert.deepEqual(sub.getViewDescriptor(), { dimension: '2d', baseArrayLayer: eye === 'right' ? 1 : 0, arrayLayerCount: 1 });
    }
    assert.equal(time, 16);
  }), 7);
  runFrame(16, {});
  assert.equal(calls.submit, 1, 'une soumission de copie par image');
  assert.deepEqual(calls.copies, [{ z: 0, x: 0, size: [683, 800, 1] }, { z: 1, x: 683, size: [683, 800, 1] }]);

  // Une session du navigateur (non préparée) passe à son XRGPUBinding, absent ici.
  assert.throws(() => new env.XRGPUBinding({ enabledFeatures: [] }, device), /XRGPUBinding indisponible/);

  end();
  assert.equal(layer.texture.destroyed, true, 'texture libérée à la fin de la session');
});

test('navigateur réel sans XRGPUBinding : la VR en WebGPU est refusée avec un message clair', () => {
  const { env, session } = fakeEmulator({ layerAcceptsSurface: false });
  assert.throws(() => prepareXRSession(session, env), /VR en WebGPU non prise en charge/);
  assert.throws(() => prepareXRSession(session, { navigator: {} }), /WebGPU indisponible/);
});
