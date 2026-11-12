// Tests de l'interface VR (pôle xr). Sans casque ni DOM : faux canvas, fausse session WebXR,
// faux rendu (src/render/mock.js) et vrai faux moteur. Three.js tourne sous Node tant qu'on
// n'affiche rien.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMockRenderer } from '../render/mock.js';
import { createMockSimulation, DEMO_SCENARIO } from '../../simulation.js';
import { init as initUi } from '../ui/index.js';
import { describeSelection } from '../ui/inspector.js';
import { createControllers, hoverChange, selectAction } from './controllers.js';
import { createVrDevicePanel, createVrStepPanel, currentStep, DEVICE_HINT, deviceSheet, STEP_HINT, stepSheet } from './infoPanels.js';
import {
  CONTROL_PANEL, controlAction, hitTest, intersectPanel, nextSpeed, panelPlane, panelPoses,
  RAY_LENGTH, rayFromPose, resolveTarget, SPEEDS, wrapText,
} from './panelLayout.js';
import { canMountRig } from './vrRig.js';
import { createVrControlPanel, drawControlPanel } from './vrPanel.js';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} ≠ ${expected}`);
const silentScheduler = { start: () => () => {} };

/** Faux contexte 2D : accepte tout, mémorise les textes écrits. */
function fakeContext() {
  const texts = [];
  const target = { texts, measureText: (text) => ({ width: String(text).length * 20 }), fillText: (text) => { texts.push(String(text)); } };
  return new Proxy(target, {
    get: (object, key) => (key in object ? object[key] : () => {}),
    set: (object, key, value) => { object[key] = value; return true; },
  });
}

/** Faux document : createElement('canvas') renvoie un canvas à faux contexte. */
function fakeDocument() {
  const contexts = [];
  return {
    contexts,
    createElement: () => {
      const ctx = fakeContext();
      contexts.push(ctx);
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
}

/** Centre d'un bouton, en coordonnées (u, v) du panneau. */
function buttonCenter(id) {
  const b = CONTROL_PANEL.buttons.find((button) => button.id === id);
  return { u: (b.x + b.w / 2) / CONTROL_PANEL.pxWidth, v: 1 - (b.y + b.h / 2) / CONTROL_PANEL.pxHeight };
}

async function loadedSim() {
  const sim = createMockSimulation({ scheduler: silentScheduler });
  await sim.load(DEMO_SCENARIO);
  return sim;
}

// --- Disposition et géométrie ---

test('panneau de commandes : les boutons ne se chevauchent pas et tiennent dans le canvas', () => {
  const zones = [...CONTROL_PANEL.buttons, CONTROL_PANEL.speed];
  for (const zone of zones) {
    assert.ok(zone.x >= 0 && zone.y >= 0 && zone.x + zone.w <= CONTROL_PANEL.pxWidth && zone.y + zone.h <= CONTROL_PANEL.pxHeight);
  }
  for (const a of zones) {
    for (const b of zones) {
      if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x, `${a.id ?? 'vitesse'} chevauche ${b.id ?? 'vitesse'}`);
    }
  }
  // Cible confortable au rayon : au moins 5 cm de côté.
  const metersPerPixel = CONTROL_PANEL.width / CONTROL_PANEL.pxWidth;
  for (const button of CONTROL_PANEL.buttons) assert.ok(button.w * metersPerPixel >= 0.05 && button.h * metersPerPixel >= 0.05);
});

test('hitTest : chaque bouton est trouvé en son centre ; rien dans la ligne d\'état ni hors du panneau', () => {
  for (const button of CONTROL_PANEL.buttons) {
    const { u, v } = buttonCenter(button.id);
    assert.equal(hitTest(CONTROL_PANEL, u, v), button.id);
  }
  assert.equal(hitTest(CONTROL_PANEL, 0.5, 0.9), null);
  assert.equal(hitTest(CONTROL_PANEL, Number.NaN, 0.5), null);
});

test('nextSpeed parcourt 0,25 → 4 et s\'arrête aux bornes', () => {
  assert.deepEqual(SPEEDS.map((speed) => nextSpeed(speed, 1)), [0.5, 1, 2, 4, 4]);
  assert.deepEqual(SPEEDS.map((speed) => nextSpeed(speed, -1)), [0.25, 0.25, 0.5, 1, 2]);
  assert.equal(nextSpeed(1.5, 1), 2, 'vitesse réglée au curseur 2D : on repart de la plus proche');
});

test('rayFromPose : sans rotation le rayon pointe vers −Z ; un quart de tour à gauche le tourne vers −X', () => {
  const identity = rayFromPose({ position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
  assert.deepEqual(identity.origin, { x: 1, y: 2, z: 3 });
  near(identity.direction.x, 0); near(identity.direction.y, 0); near(identity.direction.z, -1);

  const half = Math.SQRT1_2; // rotation de +90° autour de Y
  const left = rayFromPose({ position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: half, z: 0, w: half } });
  near(left.direction.x, -1); near(left.direction.z, 0);

  const up = rayFromPose({ position: { x: 0, y: 0, z: 0 }, orientation: { x: half, y: 0, z: 0, w: half } });
  near(up.direction.y, 1, 'rotation de +90° autour de X : le rayon monte');
});

test('intersectPanel : coordonnées (u, v), distance, bords et cas sans intersection', () => {
  // Panneau de 2 m × 1 m, face à l'utilisateur, à 3 m devant lui.
  const plane = panelPlane([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, -3, 1], 2, 1);
  const from = (x, y) => ({ origin: { x, y, z: 0 }, direction: { x: 0, y: 0, z: -1 } });

  const center = intersectPanel(from(0, 1), plane);
  near(center.u, 0.5); near(center.v, 0.5); near(center.distance, 3);
  const corner = intersectPanel(from(0.9, 1.4), plane);
  near(corner.u, 0.95); near(corner.v, 0.9);
  assert.equal(intersectPanel(from(1.1, 1), plane), null, 'à côté du panneau');
  assert.equal(intersectPanel({ origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: 1 } }, plane), null, 'panneau derrière');
  assert.equal(intersectPanel({ origin: { x: 0, y: 1, z: 0 }, direction: { x: 1, y: 0, z: 0 } }, plane), null, 'rayon parallèle');
});

test('resolveTarget : la cible la plus proche l\'emporte, panneau ou équipement', () => {
  const ray = { origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: -1 } };
  const plane = panelPlane([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, -3, 1], 2, 1);
  const device = (distance) => ({ id: 'pc1', distance, point: { x: 0, y: 1, z: -distance } });

  assert.equal(resolveTarget(ray, [plane], device(1.5)).kind, 'device');
  const panel = resolveTarget(ray, [null, plane], device(4));
  assert.equal(panel.kind, 'panel');
  assert.equal(panel.index, 1);
  assert.equal(resolveTarget(ray, [null], null), null);
});

test('wrapText : retour à la ligne, mot trop long coupé, troncature avec « … »', () => {
  const measure = (text) => text.length * 10;
  assert.deepEqual(wrapText('un deux trois quatre', 90, measure), ['un deux', 'trois', 'quatre']);
  assert.deepEqual(wrapText('02:00:00:00:01:01', 80, measure), ['02:00:00', ':00:01:0', '1']);
  assert.deepEqual(wrapText('un deux trois quatre', 90, measure, 2), ['un deux', 'trois…']);
  assert.deepEqual(wrapText('ligne une\nligne deux', 500, measure), ['ligne une', 'ligne deux']);
  assert.deepEqual(wrapText(undefined, 100, measure), []);
});

test('panelPoses : pupitre devant la maquette, fiche à gauche, explications à droite, à hauteur lisible', () => {
  const anchor = { x: 0, y: 1, z: -1.35, width: 1.5, depth: 0.6 };
  const poses = panelPoses(anchor);
  assert.ok(poses.controls.position.z > anchor.z + anchor.depth / 2, 'entre l\'utilisateur et la maquette');
  assert.ok(poses.controls.position.z < -0.4, 'à portée de rayon, pas contre l\'utilisateur');
  assert.ok(poses.controls.position.y < anchor.y && poses.controls.pitch > 0);
  assert.ok(poses.device.position.x < -anchor.width / 2 && poses.step.position.x > anchor.width / 2);
  assert.ok(poses.device.yaw > 0 && poses.step.yaw < 0, 'tournés vers l\'utilisateur');
  assert.ok(poses.device.position.y > anchor.y && poses.device.position.y < anchor.y + 0.8);
});

// --- Panneau de commandes ---

test('controlAction suit les mêmes règles que les boutons HTML', async () => {
  const sim = await loadedSim();
  const panel = createVrControlPanel({ sim }, { documentRef: fakeDocument() });
  const press = (id) => { const { u, v } = buttonCenter(id); return panel.press(u, v); };

  assert.equal(press('pause'), false, 'prêt : pause désactivée');
  assert.equal(press('play'), true);
  assert.equal(sim.getState().status, 'playing');
  assert.equal(press('step'), false, 'en lecture : pas à pas désactivé');
  assert.equal(press('pause'), true);
  assert.equal(press('step'), true);
  assert.ok(sim.getHistory().length > 0);

  assert.equal(press('faster'), true);
  assert.equal(sim.getState().speed, 2);
  press('faster');
  assert.equal(press('faster'), false, 'déjà à la vitesse maximale');
  assert.equal(sim.getState().speed, 4);
  press('slower');
  assert.equal(sim.getState().speed, 2);

  assert.equal(press('reset'), true);
  assert.equal(sim.getState().status, 'ready');
  assert.equal(panel.press(0.5, 0.95), false, 'gâchette hors bouton');
  panel.dispose();
});

test('le panneau de commandes affiche l\'état, le temps et la vitesse, et se redessine quand le moteur change', async () => {
  const sim = await loadedSim();
  const doc = fakeDocument();
  const panel = createVrControlPanel({ sim }, { documentRef: doc });
  const { texts } = doc.contexts[0];
  for (const expected of ['Prêt', 't = 0,0 s', 'Lecture', 'Pause', 'Pas à pas', '−', '+', 'Réinitialiser', 'Vitesse', '×1']) {
    assert.ok(texts.includes(expected), `« ${expected} » absent du panneau`);
  }
  texts.length = 0;
  sim.play(); // commande venue de l'interface 2D
  assert.ok(texts.includes('En lecture'));

  texts.length = 0;
  panel.hover(buttonCenter('pause').u, buttonCenter('pause').v);
  assert.ok(texts.length > 0, 'le survol redessine le panneau');
  const drawn = texts.length;
  panel.hover(buttonCenter('pause').u, buttonCenter('pause').v);
  assert.equal(texts.length, drawn, 'même bouton survolé : rien à redessiner');
  panel.dispose();
});

test('panneau de commandes sans moteur : tout désactivé, aucune erreur', () => {
  const ctx = fakeContext();
  const panel = createVrControlPanel({}, { documentRef: fakeDocument() });
  assert.equal(panel.press(buttonCenter('play').u, buttonCenter('play').v), false);
  drawControlPanel(ctx, { status: 'unavailable', statusLabel: 'Moteur indisponible', time: '— s', speed: 1, speedLabel: '×1', error: null, enabled: {} });
  assert.ok(ctx.texts.includes('Moteur indisponible'));
  assert.equal(controlAction('inconnu', { enabled: {} }), null);
  panel.dispose();
});

// --- Fiche d'équipement et explications ---

test('fiche VR de PC 1 : mêmes données que l\'inspecteur 2D', async () => {
  const sim = await loadedSim();
  const sheet = deviceSheet(describeSelection({ sim }, 'pc1'));
  assert.equal(sheet.title, 'PC 1');
  assert.deepEqual(sheet.props.at(-1), { label: 'Passerelle', value: '192.168.1.1' });
  assert.deepEqual(sheet.interfaces, [{ name: 'eth0', ip: '192.168.1.10/24', mac: '02:00:00:00:01:01' }]);

  assert.equal(deviceSheet(null).hint, DEVICE_HINT);
  assert.match(deviceSheet({ id: 'zz', found: false }).hint, /introuvable/);
});

test('la fiche VR suit la sélection (app.ui), y compris celle faite en 2D', async () => {
  const sim = await loadedSim();
  const app = { sim };
  app.ui = await initUi(app, { root: undefined });
  const doc = fakeDocument();
  const panel = createVrDevicePanel(app, { documentRef: doc });
  const { texts } = doc.contexts[0];
  assert.ok(texts.some((text) => text.startsWith('Visez un équipement')));

  texts.length = 0;
  app.ui.select('r1');
  assert.ok(texts.includes('Routeur'));
  assert.ok(texts.includes('IP   192.168.2.1/24'));
  assert.ok(texts.includes('MAC  02:00:00:00:00:a1'));

  panel.dispose();
  texts.length = 0;
  app.ui.select('pc1');
  assert.equal(texts.length, 0, 'plus de mise à jour après dispose()');
});

test('explications VR : étape publiée par le moteur, effacée à la réinitialisation', async () => {
  const sim = await loadedSim();
  const doc = fakeDocument();
  const panel = createVrStepPanel({ sim }, { documentRef: doc });
  const { texts } = doc.contexts[0];
  assert.ok(texts.some((text) => text.startsWith('Lancez la simulation')));
  assert.ok(texts.some((text) => text.startsWith('EXPLICATIONS · Démonstration')));

  texts.length = 0;
  sim.step();
  assert.ok(texts.includes('Aller'), 'titre de la première étape du scénario');
  assert.deepEqual(currentStep(sim), { title: 'Aller', text: DEMO_SCENARIO.steps[0].text });

  texts.length = 0;
  sim.reset();
  assert.ok(texts.some((text) => text.startsWith('Lancez la simulation')));
  panel.dispose();

  assert.deepEqual(stepSheet(null, null), { heading: 'EXPLICATIONS', title: null, text: STEP_HINT, hint: true });
  assert.equal(currentStep(undefined), null);
});

// --- Manettes ---

test('selectAction et hoverChange (fonctions pures)', () => {
  assert.equal(selectAction(null), null);
  assert.deepEqual(selectAction({ kind: 'device', id: 'pc1', distance: 1, point: {} }), { type: 'select', id: 'pc1' });
  assert.deepEqual(selectAction({ kind: 'panel', index: 0, u: 0.2, v: 0.3, distance: 1, point: {} }), { type: 'press', index: 0, u: 0.2, v: 0.3 });

  assert.deepEqual(hoverChange(null, 'pc1', null), { restore: [], light: 'pc1' });
  assert.deepEqual(hoverChange('pc1', 'r1', null), { restore: [{ id: 'pc1', mode: 'normal' }], light: 'r1' });
  assert.deepEqual(hoverChange('pc1', null, 'pc1'), { restore: [{ id: 'pc1', mode: 'selected' }], light: null }, 'on rend sa surbrillance à l\'équipement sélectionné');
  assert.deepEqual(hoverChange(null, 'pc1', 'pc1'), { restore: [], light: null }, 'l\'équipement sélectionné n\'est pas éclairé une seconde fois');
  assert.deepEqual(hoverChange('pc1', 'pc1', null), { restore: [], light: null });
});

/** Fausse session WebXR : une manette dont on choisit la pose image par image. */
function fakeXR() {
  const session = new EventTarget();
  const source = { handedness: 'right', targetRayMode: 'tracked-pointer', targetRaySpace: { nom: 'rayon droit' } };
  session.inputSources = [source];
  const referenceSpace = { nom: 'local-floor' };
  let transform = null;
  const xrFrame = {
    getPose(space, base) {
      assert.equal(space, source.targetRaySpace);
      assert.equal(base, referenceSpace);
      return transform ? { transform } : null;
    },
  };
  return {
    session, source, referenceSpace, xrFrame,
    /** Manette en (x, y, z), pointée vers −Z. null = suivi perdu. */
    aim(position) { transform = position ? { position, orientation: { x: 0, y: 0, z: 0, w: 1 } } : null; },
    pull() {
      const event = new Event('select');
      event.frame = xrFrame;
      event.inputSource = source;
      session.dispatchEvent(event);
    },
  };
}

async function vrApp(t) {
  const sim = await loadedSim();
  const render = createMockRenderer();
  render.loadTopology(sim.getScenario()); // pc1 en (−4, 0, 0) … pc2 en (4, 0, 0)
  const xr = fakeXR();
  render.getReferenceSpace = () => xr.referenceSpace;
  const app = { sim, render };
  app.ui = await initUi(app, { root: undefined });
  t.mock.method(render, 'highlightDevice');
  return { app, sim, render, xr };
}

test('manette : le rayon suit la pose du XRFrame, s\'arrête sur l\'équipement visé et l\'éclaire', async (t) => {
  const { app, render, xr } = await vrApp(t);
  const { Group } = await import('../../vendor/three/build/three.webgpu.js');
  const parent = new Group();
  const controllers = createControllers({ app, session: xr.session, parent, panels: [] });
  const [line, dot] = parent.children[0].children.length ? parent.children[0].children : [];
  assert.equal(line, undefined, 'aucun rayon avant la première image');

  xr.aim({ x: -4, y: 0, z: 5 }); // face à pc1, à 5 m
  controllers.update({ xrFrame: xr.xrFrame, referenceSpace: xr.referenceSpace });
  const [ray, reticle] = parent.children[0].children;
  assert.equal(ray.visible, true);
  near(ray.scale.z, 5, 'le trait s\'arrête sur la cible');
  assert.equal(reticle.visible, true);
  near(reticle.position.z, 0);
  assert.deepEqual(render.highlightDevice.mock.calls.at(-1).arguments, ['pc1', 'active']);

  xr.aim({ x: 0, y: 30, z: 5 }); // dans le vide
  controllers.update({ xrFrame: xr.xrFrame, referenceSpace: xr.referenceSpace });
  near(ray.scale.z, RAY_LENGTH);
  assert.equal(reticle.visible, false);
  assert.deepEqual(render.highlightDevice.mock.calls.at(-1).arguments, ['pc1', 'normal']);

  xr.aim(null); // suivi perdu
  controllers.update({ xrFrame: xr.xrFrame, referenceSpace: xr.referenceSpace });
  assert.equal(ray.visible, false);

  controllers.dispose();
  assert.equal(parent.children.length, 0);
});

test('manette : la gâchette sélectionne l\'équipement visé (app.ui.select) ou presse un bouton du panneau', async (t) => {
  const { app, sim, xr } = await vrApp(t);
  const { Group } = await import('../../vendor/three/build/three.webgpu.js');
  const parent = new Group();
  const pressed = [];
  // Panneau factice de 1 m × 1 m, à 1 m devant une manette placée en x = 20.
  const panel = {
    getPlane: () => panelPlane([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 20, 0, 4, 1], 1, 1),
    hover: (u) => { panel.hovered = u; },
    press: (u, v) => { pressed.push([u, v]); return sim.play(); },
  };
  const controllers = createControllers({ app, session: xr.session, parent, panels: [panel] });

  xr.aim({ x: 4, y: 0, z: 5 }); // pc2
  xr.pull();
  assert.equal(app.ui.getSelection(), 'pc2');

  xr.aim({ x: 20.25, y: 0, z: 5 });
  controllers.update({ xrFrame: xr.xrFrame, referenceSpace: xr.referenceSpace });
  near(panel.hovered, 0.75);
  xr.pull();
  assert.equal(pressed.length, 1);
  near(pressed[0][0], 0.75); near(pressed[0][1], 0.5);
  assert.equal(sim.getState().status, 'playing');
  assert.equal(app.ui.getSelection(), 'pc2', 'presser un bouton ne change pas la sélection');

  xr.aim({ x: 0, y: 30, z: 5 });
  xr.pull();
  assert.equal(app.ui.getSelection(), 'pc2', 'gâchette dans le vide : la sélection est gardée');

  controllers.dispose();
  xr.aim({ x: -4, y: 0, z: 5 });
  xr.pull();
  assert.equal(app.ui.getSelection(), 'pc2', 'plus d\'écoute après dispose()');
});

test('canMountRig : l\'interface VR exige la scène, la boucle et l\'ancrage du rendu', () => {
  assert.equal(canMountRig({}), false);
  assert.equal(canMountRig({ render: createMockRenderer() }), false, 'le faux rendu n\'a pas de scène Three.js');
  assert.equal(canMountRig({ render: { scene: {}, onFrame() {}, getVRAnchor() {} } }), true);
});
