// Tests de la détection WebXR (pôle xr). Placés ici et non dans tests/ ; `node --test` les trouve.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { capabilityRows, describeStatus, detectCapabilities } from './session.js';

const fakeEnv = ({ secure = true, xr = null, gpu = false, webgl2 = true } = {}) => ({
  isSecureContext: secure,
  navigator: { ...(xr ? { xr } : {}), ...(gpu ? { gpu: {} } : {}) },
  document: { createElement: () => ({ getContext: (type) => (type === 'webgl2' && webgl2 ? {} : null) }) },
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

test('le détail liste WebXR, VR, AR, WebGL 2 et WebGPU', async () => {
  const caps = await detectCapabilities(fakeEnv({ xr: fakeXR(['immersive-vr']), gpu: true }));
  const rows = capabilityRows(caps);
  assert.equal(rows.length, 6);
  assert.equal(rows.find((r) => r.label.startsWith('WebGPU')).value, 'détecté, non utilisé (voir décision)');
  assert.ok(rows.every((r) => typeof r.value === 'string' && typeof r.ok === 'boolean'));
});
