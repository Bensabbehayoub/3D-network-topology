// Tests de la détection WebXR (pôle xr). Placés ici et non dans tests/ ; `node --test` les trouve.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { capabilityRows, describeStatus, detectCapabilities } from './session.js';

const fakeEnv = ({ secure = true, xr = null, gpu = false, binding = undefined } = {}) => ({
  isSecureContext: secure,
  navigator: { ...(xr ? { xr } : {}), ...(gpu ? { gpu: {} } : {}) },
  // Rendu 100 % WebGPU : la détection ne doit jamais créer de contexte WebGL.
  document: { createElement: () => ({ getContext: (type) => { throw new Error(`contexte ${type} créé`); } }) },
  ...(binding ? { XRGPUBinding: binding } : {}),
});

const fakeXR = (modes) => ({ isSessionSupported: async (mode) => modes.includes(mode) });

test('sans navigator.xr : WebXR non détectée, mode 2D', async () => {
  const caps = await detectCapabilities(fakeEnv());
  assert.equal(caps.webxr, false);
  assert.equal(caps.immersiveVR, false);
  const status = describeStatus(caps);
  assert.equal(status.state, 'absent');
  assert.equal(status.label, 'WebXR non détectée');
  assert.match(status.hint, /Mode 2D/);
});

test('avec un casque (réel ou émulé) : WebXR détectée, VR disponible', async () => {
  const caps = await detectCapabilities(fakeEnv({ xr: fakeXR(['immersive-vr']) }));
  assert.deepEqual(
    { webxr: caps.webxr, vr: caps.immersiveVR, ar: caps.immersiveAR },
    { webxr: true, vr: true, ar: false },
  );
  assert.equal(describeStatus(caps).state, 'vr');
  assert.equal(describeStatus(caps).label, 'WebXR détectée');
});

test('API présente sans session immersive-vr : détectée mais VR indisponible', async () => {
  const caps = await detectCapabilities(fakeEnv({ xr: fakeXR([]) }));
  assert.equal(describeStatus(caps).state, 'no-vr');
});

test('hors HTTPS, WebXR est considérée comme indisponible', async () => {
  const caps = await detectCapabilities(fakeEnv({ secure: false, xr: fakeXR(['immersive-vr']) }));
  assert.equal(describeStatus(caps).state, 'insecure');
  assert.match(describeStatus(caps).hint, /HTTPS/);
});

test('une erreur de isSessionSupported ne casse pas la détection', async () => {
  const xr = { isSessionSupported: async () => { throw new Error('bloqué'); } };
  const caps = await detectCapabilities(fakeEnv({ xr }));
  assert.equal(caps.webxr, true);
  assert.equal(caps.immersiveVR, false);
});

test('le détail liste WebXR, VR, AR, WebGPU, XRGPUBinding et le rendu réellement utilisé, sans WebGL', async () => {
  const caps = await detectCapabilities(fakeEnv({ xr: fakeXR(['immersive-vr']), gpu: true }));
  assert.equal('webgl2' in caps, false);
  const rows = capabilityRows(caps, { classic: 'WebGPU', xr: null });
  assert.equal(rows.length, 8);
  assert.equal(rows.some((r) => /WebGL/.test(r.label)), false, 'aucune ligne WebGL');
  assert.equal(rows.find((r) => r.label.startsWith('WebGPU')).value, 'détecté');
  assert.equal(rows.find((r) => r.label.startsWith('XRGPUBinding')).value, "fourni par le pont de l'émulateur");
  assert.equal(rows.find((r) => r.label === 'Rendu en mode classique').value, 'WebGPU (WebGPURenderer)');
  assert.match(rows.find((r) => r.label === 'Rendu en VR').value, /^WebGPU.*aucun contexte WebGL/);
  assert.ok(rows.every((r) => typeof r.value === 'string' && typeof r.ok === 'boolean'));
});

test("XRGPUBinding du navigateur reconnu, le pont de l'émulateur non compté", async () => {
  const native = class {};
  const bridge = class { static isTopologyBridge = true; };
  assert.equal((await detectCapabilities(fakeEnv({ binding: native }))).xrGPUBinding, true);
  assert.equal((await detectCapabilities(fakeEnv({ binding: bridge }))).xrGPUBinding, false);
  assert.equal((await detectCapabilities(fakeEnv())).xrGPUBinding, false);
});

test('le détail suit le rendu : session VR native ou par le pont, WebGPU absent', async () => {
  const caps = await detectCapabilities(fakeEnv({ xr: fakeXR(['immersive-vr']) }));
  const value = (rendering, label) => capabilityRows(caps, rendering).find((r) => r.label === label).value;
  assert.equal(value({ classic: 'WebGPU', xr: { backend: 'WebGPU', path: 'pont émulateur' } }, 'Rendu en VR'), "WebGPU — pont WebGPU de l'émulateur");
  assert.equal(value({ classic: 'WebGPU', xr: { backend: 'WebGPU', path: 'natif' } }, 'Rendu en VR'), 'WebGPU — XRGPUBinding du navigateur');
  assert.match(value(null, 'Rendu en mode classique'), /WebGPU requis/);
  assert.match(value(null, 'Rendu en VR'), /WebGPU requis/);
  assert.match(capabilityRows(caps, null).find((r) => r.label.startsWith('WebGPU')).value, /WebGPU requis/);
});

test('options de session : « webgpu » ajouté quand le rendu le demande, sans doublon', async () => {
  const { sessionOptions, SESSION_OPTIONS } = await import('./session.js');
  assert.deepEqual(sessionOptions(), { optionalFeatures: [...SESSION_OPTIONS.optionalFeatures] });
  assert.deepEqual(sessionOptions(['webgpu', 'local-floor']).optionalFeatures, ['local-floor', 'bounded-floor', 'webgpu']);
  assert.deepEqual(sessionOptions('pas un tableau').optionalFeatures, [...SESSION_OPTIONS.optionalFeatures]);
});
