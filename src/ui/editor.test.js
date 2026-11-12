// Tests de l'éditeur de topologie (phase 7a) : contrôleur sans DOM, avec le vrai moteur.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createSimulation, TOPICS } from '../../simulation.js';
import { DEVICE_BEHAVIOURS } from '../sim/devices/index.js';
import { createEditorController, freeSpot, linkLabel, mount } from './editor.js';
import { createModeService } from './modeSwitch.js';

async function setup() {
  const ping = JSON.parse(await readFile(new URL('../../scenarios/ping.json', import.meta.url), 'utf8'));
  const sim = createSimulation({ devices: DEVICE_BEHAVIOURS, scheduler: { start: () => () => {} } });
  await sim.load(ping);
  // Comme src/sim/index.js : recharger un scénario fourni par son id.
  const app = { sim: { ...sim, loadScenario: async (id) => (id === 'ping' ? sim.load(ping) : false), listScenarios: () => [{ id: 'ping' }] } };
  let selected = null;
  const selection = { getSelection: () => selected, select: (id) => { selected = id; return true; }, clear: () => { selected = null; return true; } };
  const views = [];
  const editor = createEditorController(app, { onChange: (view) => views.push(view), selection });
  return { app, sim, editor, views, selection };
}

test('place libre : spirale autour du centre, sans chevauchement', () => {
  assert.deepEqual(freeSpot([]), [0, 0, 0]);
  assert.deepEqual(freeSpot([{ position: [0, 0, 0] }]), [-3, 0, -3]);
  const many = Array.from({ length: 8 }, (_, i) => ({ position: freeSpot([]) })).reduce((list) => [...list, { position: freeSpot(list) }], []);
  assert.equal(new Set(many.map((d) => d.position.join(','))).size, many.length);
});

test('entrer en construction : copie du scénario affiché, chargée dans le moteur', async () => {
  const { sim, editor } = await setup();
  const scenarios = [];
  sim.on(TOPICS.SCENARIO, ({ scenario }) => scenarios.push(scenario));
  await editor.enter();
  assert.equal(editor.isActive(), true);
  assert.equal(sim.getScenario().id, 'perso');
  assert.equal(sim.getScenario().protocol, 'aucun');
  assert.equal(sim.getScenario().devices.length, 5);
  assert.equal(scenarios.length, 1, 'la scène et le diagnostic suivent (TOPICS.SCENARIO)');
  await editor.leave();
  assert.equal(sim.getScenario().id, 'ping', 'retour au scénario affiché avant');
});

test('ajouter, renommer, relier, retirer : brouillon rechargé à chaque fois, messages', async () => {
  const { sim, editor, selection } = await setup();
  await editor.enter();
  await editor.restart(false);
  assert.equal(sim.getScenario().devices.length, 0, 'topologie vide');
  const pc = await editor.addAtCenter('pc-1g');
  assert.equal(pc, 'pc1');
  assert.equal(selection.getSelection(), 'pc1', 'le nouvel équipement est sélectionné');
  await editor.addAtCenter('sw-24g');
  assert.equal(editor.getView().notice, 'Switch 1 ajouté.');
  assert.deepEqual(sim.getScenario().devices.map((d) => d.position), [[0, 0, 0], [-3, 0, -3]]);
  await editor.connect('pc1:eth0', 'sw1:p1');
  assert.equal(sim.getScenario().links.length, 1);
  assert.match(editor.getView().notice, /Câble posé : PC 1 \(eth0\) ↔ Switch 1 \(p1\)/);
  assert.equal(editor.getView().links[0].bandwidth, '1 Gb/s');
  assert.equal(await editor.connect('pc1:eth0', 'sw1:p2'), false);
  assert.match(editor.getView().error, /déjà relié/);
  await editor.rename('pc1', 'Accueil');
  assert.equal(sim.getScenario().devices[0].label, 'Accueil');
  selection.select('pc1'); // l'ajout du switch l'avait sélectionné
  assert.equal(editor.getView().selected.label, 'Accueil');
  assert.deepEqual(editor.getView().selected.ports, [{ name: 'eth0', peer: 'Switch 1 (p1)' }]);
  await editor.move('pc1', [4, 0, 1]);
  assert.deepEqual(sim.getScenario().devices[0].position, [4, 0, 1]);
  await editor.disconnect('l1');
  assert.equal(sim.getScenario().links.length, 0);
  await editor.remove('sw1');
  assert.deepEqual(sim.getScenario().devices.map((d) => d.id), ['pc1']);
});

test('placement dans la scène : armé par le modèle, consommé par un toucher du sol', async () => {
  const { sim, editor } = await setup();
  await editor.enter();
  assert.equal(await editor.place([1, 0, 1]), false, 'rien d\'armé : le sol ne fait rien');
  editor.arm('rt-4g');
  assert.match(editor.getView().notice, /Touchez le sol/);
  const id = await editor.place([6, 0, 2]);
  assert.equal(id, 'r2', 'r1 existe déjà dans la copie du scénario ping');
  assert.deepEqual(sim.getScenario().devices.find((d) => d.id === 'r2').position, [6, 0, 2]);
  assert.equal(editor.getView().armed, null);
  editor.arm('pc-1g');
  editor.arm(null);
  assert.equal(await editor.place([0, 0, 0]), false);
});

test('repartir d\'une copie du scénario affiché, et brouillon gardé entre deux constructions', async () => {
  const { sim, editor } = await setup();
  await editor.enter();
  await editor.addAtCenter('pc-1g');
  await editor.leave();
  await editor.enter();
  assert.equal(sim.getScenario().devices.length, 6, 'le brouillon est retrouvé');
  await editor.restart(true);
  assert.equal(sim.getScenario().devices.length, 5, 'copie du scénario ping');
  assert.equal(sim.getScenario().title, 'Ping : joindre un PC d\'un autre réseau (copie)');
});

test('service de mode : éditeur, rendu, onglets et mise en page prévenus', async () => {
  const calls = [];
  const editor = { enter: async () => calls.push('entrer'), leave: async () => calls.push('sortir') };
  const body = { dataset: {} };
  const mode = createModeService({
    getEditor: () => editor,
    render: { setEditMode: (on) => calls.push(`rendu ${on}`) },
    tabs: { select: (id) => calls.push(`onglet ${id}`) },
    body,
  });
  assert.equal(await mode.set('build'), true);
  assert.equal(body.dataset.mode, 'build');
  assert.equal(await mode.set('build'), false, 'déjà dans ce mode');
  await mode.set('explore');
  assert.equal(await mode.set('inconnu'), false);
  assert.deepEqual(calls, ['rendu true', 'entrer', 'onglet recommendations', 'rendu false', 'sortir', 'onglet explanations']);
});

test('mount sous Node : gabarit fixe, aucun nom d\'équipement dans le HTML', async () => {
  const { app } = await setup();
  const container = { innerHTML: '' };
  const editor = mount(container, app);
  assert.match(container.innerHTML, /Relier deux ports libres/);
  assert.doesNotMatch(container.innerHTML, /PC 1/);
  assert.equal(linkLabel({ devices: [{ id: 'a', label: 'A' }, { id: 'b' }] }, { a: 'a:x', b: 'b:y' }), 'A (x) ↔ b (y)');
  editor.dispose();
});
