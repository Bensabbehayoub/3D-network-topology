// Tests de la barre de commandes (Ramy, tâche 17). Sans DOM : on teste controlsView() et le
// contrôleur avec le vrai faux moteur, piloté par une horloge manuelle (aucun setInterval).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMockSimulation, createSimulation, DEMO_PROTOCOL, DEMO_SCENARIO, MAX_SPEED, MIN_SPEED } from '../../simulation.js';
import {
  clampSpeed, controlsView, createControlsController, formatSpeed, formatTime, mount,
} from './controls.js';

/** Horloge de lecture contrôlée par le test : advance(ms) joue une image de ms millisecondes. */
function manualScheduler() {
  let onFrame = null;
  return {
    start(callback) {
      onFrame = callback;
      return () => { onFrame = null; };
    },
    advance(ms) { onFrame?.(ms); },
  };
}

async function loadedSim() {
  const scheduler = manualScheduler();
  const sim = createMockSimulation({ scheduler });
  await sim.load(DEMO_SCENARIO);
  return { sim, scheduler };
}

const enabledOf = (view) => view.enabled;

test('prêt : lecture, pas à pas, vitesse et réinitialiser actifs ; pause inactive', async () => {
  const { sim } = await loadedSim();
  const view = createControlsController({ sim }).getView();
  assert.equal(view.status, 'ready');
  assert.equal(view.statusLabel, 'Prêt');
  assert.equal(view.time, '0,0 s');
  assert.deepEqual(enabledOf(view), { play: true, pause: false, step: true, speed: true, reset: true });
});

test('en lecture : seuls pause, vitesse et réinitialiser sont actifs', async () => {
  const { sim } = await loadedSim();
  const controls = createControlsController({ sim });
  assert.equal(controls.run('play'), true);
  const view = controls.getView();
  assert.equal(view.statusLabel, 'En lecture');
  assert.deepEqual(enabledOf(view), { play: false, pause: true, step: false, speed: true, reset: true });
});

test('en pause : lecture et pas à pas reviennent', async () => {
  const { sim } = await loadedSim();
  const controls = createControlsController({ sim });
  controls.run('play');
  assert.equal(controls.run('pause'), true);
  const view = controls.getView();
  assert.equal(view.statusLabel, 'En pause');
  assert.deepEqual(enabledOf(view), { play: true, pause: false, step: true, speed: true, reset: true });
});

test('terminé : seuls vitesse et réinitialiser restent actifs, puis réinitialiser ramène à prêt', async () => {
  const { sim } = await loadedSim();
  const controls = createControlsController({ sim });
  for (let i = 0; i < 100 && controls.getView().status !== 'finished'; i += 1) controls.run('step');
  const view = controls.getView();
  assert.equal(view.statusLabel, 'Terminé');
  assert.deepEqual(enabledOf(view), { play: false, pause: false, step: false, speed: true, reset: true });

  assert.equal(controls.run('reset'), true);
  assert.equal(controls.getView().status, 'ready');
  assert.equal(controls.getView().time, '0,0 s');
});

test('aucun scénario chargé : tout est inactif sauf la vitesse', () => {
  const sim = createMockSimulation({ scheduler: manualScheduler() });
  const view = createControlsController({ sim }).getView();
  assert.equal(view.statusLabel, 'Aucun scénario');
  assert.deepEqual(enabledOf(view), { play: false, pause: false, step: false, speed: true, reset: false });
});

test('la vue suit le moteur même quand la commande vient d\'ailleurs (TOPICS.STATE), et le temps avance (TOPICS.TICK)', async () => {
  const { sim, scheduler } = await loadedSim();
  const views = [];
  const controls = createControlsController({ sim }, { onChange: (view) => views.push(view) });

  sim.play(); // par exemple depuis le panneau VR
  assert.equal(controls.getView().status, 'playing');

  scheduler.advance(50);
  assert.ok(sim.getState().time > 0);
  assert.equal(controls.getView().time, formatTime(sim.getState().time));
  assert.ok(views.length >= 2);

  controls.destroy();
  const count = views.length;
  sim.pause();
  assert.equal(views.length, count, 'plus de rafraîchissement après destroy()');
});

test('vitesse : bornée par MIN_SPEED et MAX_SPEED, affichée ×n', async () => {
  const { sim } = await loadedSim();
  const controls = createControlsController({ sim });

  assert.equal(controls.run('speed', 2), true);
  assert.equal(controls.getView().speedLabel, '×2');

  controls.run('speed', 100);
  assert.equal(sim.getState().speed, MAX_SPEED);
  assert.equal(controls.getView().speedLabel, '×4');

  controls.run('speed', 0);
  assert.equal(sim.getState().speed, MIN_SPEED);
  assert.equal(controls.getView().speedLabel, '×0,25');

  assert.equal(controls.run('speed', 'abc'), false);
  assert.equal(sim.getState().speed, MIN_SPEED);

  assert.equal(clampSpeed(-3), MIN_SPEED);
  assert.equal(clampSpeed('1.5'), 1.5);
  assert.equal(formatSpeed(1), '×1');
  assert.equal(formatSpeed(0.75), '×0,75');
});

test('le curseur de vitesse reprend les bornes du moteur', () => {
  const container = { innerHTML: '' };
  mount(container, {});
  assert.match(container.innerHTML, new RegExp(`min="${MIN_SPEED}" max="${MAX_SPEED}"`));
});

test('une erreur de protocole est affichée sans bloquer les commandes', async (t) => {
  t.mock.method(console, 'error', () => {});
  const broken = { ...DEMO_PROTOCOL, name: 'broken', start() { throw new Error('paquet invalide'); } };
  const sim = createSimulation({ protocol: broken, scheduler: manualScheduler() });
  await sim.load(DEMO_SCENARIO);
  const controls = createControlsController({ sim });

  controls.run('step');
  const view = controls.getView();
  assert.equal(view.error, 'paquet invalide');
  assert.equal(view.statusLabel, 'En pause');
  assert.equal(view.enabled.reset, true);

  controls.run('reset');
  assert.equal(controls.getView().error, null);
});

test('raccourcis clavier : Espace, flèche droite, R', async () => {
  const { sim } = await loadedSim();
  const controls = createControlsController({ sim });
  const body = { tagName: 'BODY' };

  assert.equal(controls.handleKey({ key: ' ', target: body }), true);
  assert.equal(sim.getState().status, 'playing');
  controls.handleKey({ key: ' ', target: body });
  assert.equal(sim.getState().status, 'paused');

  const before = sim.getState().time;
  assert.equal(controls.handleKey({ key: 'ArrowRight', target: body }), true);
  assert.ok(sim.getState().time >= before);
  assert.ok(sim.getHistory().length > 0);

  assert.equal(controls.handleKey({ key: 'R', target: body }), true);
  assert.equal(sim.getState().status, 'ready');
  assert.equal(controls.handleKey({ key: 'x', target: body }), false);
});

test('raccourcis ignorés dans un champ de saisie, avec Ctrl, et Espace sur un bouton', async () => {
  const { sim } = await loadedSim();
  const controls = createControlsController({ sim });

  for (const target of [{ tagName: 'INPUT' }, { tagName: 'select' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }]) {
    assert.equal(controls.handleKey({ key: ' ', target }), false);
    assert.equal(controls.handleKey({ key: 'ArrowRight', target }), false);
  }
  assert.equal(controls.handleKey({ key: 'r', ctrlKey: true, target: { tagName: 'BODY' } }), false);
  assert.equal(controls.handleKey({ key: ' ', target: { tagName: 'BUTTON' } }), false);
  assert.equal(sim.getState().status, 'ready');
});

test('sans moteur ou moteur incomplet : tout est désactivé, aucune erreur', () => {
  for (const app of [undefined, {}, { sim: {} }, { sim: { play() {}, on() {} } }]) {
    const controls = createControlsController(app);
    const view = controls.getView();
    assert.equal(view.statusLabel, 'Moteur indisponible');
    assert.ok(Object.values(view.enabled).every((enabled) => enabled === false));
    assert.equal(controls.run('play'), false);
    assert.equal(controls.handleKey({ key: ' ' }), false, 'Espace doit garder son rôle normal (défilement)');
    controls.destroy();
  }
  assert.equal(controlsView(null).enabled.play, false);
});

test('mount sans DOM (faux conteneur) écrit la barre et renvoie son API', () => {
  const container = { innerHTML: '' };
  const api = mount(container, {});
  assert.match(container.innerHTML, /data-command="play"/);
  assert.equal(typeof api.run, 'function');
  assert.equal(api.getView().statusLabel, 'Moteur indisponible');
  api.destroy();
});
