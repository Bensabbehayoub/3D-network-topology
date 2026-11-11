// Tests du pôle xr (Ayoub). Placés ici et non dans tests/ (dossier de Khalil) ;
// `node --test` les trouve quand même. Aucun navigateur sous Node : faux navigator.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { init } from './index.js';
import { detectXR, renderStatus, XR_STATUS } from './session.js';

const fakeNavigator = (supported) => ({
  xr: {
    listeners: {},
    isSessionSupported: async (mode) => {
      if (supported instanceof Error) throw supported;
      return mode === 'immersive-vr' && supported;
    },
    addEventListener(type, fn) { this.listeners[type] = fn; },
  },
});

test('sans navigator.xr : WebXR non détectée', async () => {
  const result = await detectXR({}, { secure: true });
  assert.equal(result.status, XR_STATUS.ABSENT);
  assert.equal(result.label, 'WebXR : non détectée');
});

test('page non sécurisée : le message explique pourquoi', async () => {
  const result = await detectXR({}, { secure: false });
  assert.match(result.detail, /HTTPS/);
});

test('API présente sans VR immersive : détectée, mais VR indisponible', async () => {
  const result = await detectXR(fakeNavigator(false), { secure: true });
  assert.equal(result.status, XR_STATUS.API_ONLY);
  assert.equal(result.label, 'WebXR : détectée');
  assert.equal(result.immersiveVr, false);
});

test('VR immersive prise en charge', async () => {
  const result = await detectXR(fakeNavigator(true), { secure: true });
  assert.equal(result.status, XR_STATUS.VR);
  assert.equal(result.immersiveVr, true);
});

test('isSessionSupported qui échoue ne casse pas la détection', async () => {
  const result = await detectXR(fakeNavigator(new Error('SecurityError')), { secure: true });
  assert.equal(result.status, XR_STATUS.API_ONLY);
});

test('un casque branché après coup met le statut à jour', async () => {
  const nav = fakeNavigator(false);
  const slot = { innerHTML: '', dataset: {} };
  const { mountStatus } = await import('./session.js');
  const status = await mountStatus(slot, nav);
  assert.equal(status.getStatus().status, XR_STATUS.API_ONLY);
  nav.xr.isSessionSupported = async () => true;
  await nav.xr.listeners.devicechange();
  assert.equal(status.getStatus().status, XR_STATUS.VR);
  assert.equal(slot.dataset.xrStatus, XR_STATUS.VR);
});

test('le statut HTML est écrit dans le conteneur', async () => {
  const slot = { innerHTML: '', dataset: {} };
  renderStatus(slot, await detectXR({}, { secure: true }));
  assert.match(slot.innerHTML, /WebXR : non détectée/);
  assert.match(slot.innerHTML, /role="status"/);
  assert.equal(slot.dataset.xrStatus, XR_STATUS.ABSENT);
});

test('init remplit #xr-slot', async () => {
  const slot = { innerHTML: '', dataset: {} };
  const xr = await init({}, { root: { getElementById: (id) => (id === 'xr-slot' ? slot : null) } });
  assert.match(slot.innerHTML, /WebXR : (non )?détectée/);
  assert.ok(Object.values(XR_STATUS).includes(xr.support.status));
});
