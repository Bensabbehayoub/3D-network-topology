// Tests de la sélection (Ramy, tâche 18). Sans DOM : EventTarget et CustomEvent de Node
// remplacent document et #scene ; le faux rendu d'Aziz (src/render/mock.js) émet le clic.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMockRenderer } from '../render/mock.js';
import { createMockSimulation, DEMO_SCENARIO } from '../../simulation.js';
import { init } from './index.js';
import { attachSelection, createSelection, DEVICE_SELECTED_EVENT, deviceExists } from './selection.js';

const silentScheduler = { start: () => () => {} };

/** Autre scénario valide (ids différents de DEMO_SCENARIO) pour tester le changement de scénario. */
const OTHER_SCENARIO = {
  schema: 1, id: 'other', title: 'Autre', protocol: 'demo',
  devices: [
    { id: 'a', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:0a:01', ip: '10.0.0.1/24' }] },
    { id: 'b', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:0b:01', ip: '10.0.0.2/24' }] },
  ],
  links: [{ id: 'l1', a: 'a:eth0', b: 'b:eth0' }],
  steps: [{ id: 's1', title: 'Étape', text: 'Texte.' }],
};

/** Faux document : un EventTarget avec getElementById, et #scene lui-même EventTarget. */
function fakeDocument() {
  const doc = new EventTarget();
  const scene = new EventTarget();
  doc.getElementById = (id) => (id === 'scene' ? scene : null);
  return { doc, scene };
}

const keydown = (key) => Object.assign(new Event('keydown', { cancelable: true }), { key });

/** Application complète : vrai faux moteur + faux rendu branché sur #scene comme le vrai. */
async function fakeApp(t) {
  t.mock.method(console, 'warn', () => {});
  const sim = createMockSimulation({ scheduler: silentScheduler });
  await sim.load(DEMO_SCENARIO);
  const { doc, scene } = fakeDocument();
  const render = createMockRenderer({
    onDeviceClick: (id, device) => scene.dispatchEvent(new CustomEvent(DEVICE_SELECTED_EVENT, { detail: { id, device } })),
  });
  render.loadTopology(sim.getScenario());
  t.mock.method(render, 'highlightDevice');
  const app = { sim, render };
  app.ui = await init(app, { root: doc });
  return { app, doc, render };
}

const highlights = (render) => render.highlightDevice.mock.calls.map((call) => call.arguments);

test('select, getSelection, clear et onChange (gestionnaire seul)', () => {
  const painted = [];
  const selection = createSelection({ highlight: (id, mode) => painted.push([id, mode]) });
  const changes = [];
  const off = selection.onChange((id, previous) => changes.push([id, previous]));

  assert.equal(selection.getSelection(), null);
  assert.equal(selection.select('pc1'), true);
  assert.equal(selection.getSelection(), 'pc1');
  assert.equal(selection.select('pc1'), true, 'resélectionner ne change rien');
  assert.equal(selection.select('r1'), true);
  assert.equal(selection.clear(), true);
  assert.equal(selection.clear(), false, 'rien à retirer');

  assert.deepEqual(changes, [['pc1', null], ['r1', 'pc1'], [null, 'r1']]);
  assert.deepEqual(painted, [['pc1', 'selected'], ['pc1', 'normal'], ['r1', 'selected'], ['r1', 'normal']]);

  off();
  selection.select('pc2');
  assert.equal(changes.length, 3, 'plus de notification après désabonnement');
});

test('id invalide ou inconnu refusé ; une surbrillance ou un abonné en échec ne bloque rien', (t) => {
  t.mock.method(console, 'error', () => {});
  const selection = createSelection({
    highlight: () => { throw new TypeError('mode invalide'); },
    isKnown: (id) => id !== 'fantome',
  });
  for (const id of [undefined, null, '', '  ', 42, 'fantome']) assert.equal(selection.select(id), false);

  const seen = [];
  selection.onChange(() => { throw new Error('abonné cassé'); });
  selection.onChange((id) => seen.push(id));
  assert.equal(selection.select('pc1'), true);
  assert.deepEqual(seen, ['pc1']);
  assert.throws(() => selection.onChange('pas une fonction'), TypeError);
});

test('deviceExists cherche dans le scénario puis dans la scène 3D', async () => {
  const sim = createMockSimulation({ scheduler: silentScheduler });
  await sim.load(DEMO_SCENARIO);
  assert.equal(deviceExists({ sim }, 'pc1'), true);
  assert.equal(deviceExists({ sim }, 'inconnu'), false);

  const render = createMockRenderer();
  render.loadTopology({ devices: [{ id: 'pc-1', type: 'pc' }], links: [] });
  assert.equal(deviceExists({ render }, 'pc-1'), true, 'topologie de secours du rendu');
  assert.equal(deviceExists({ render }, 'pc1'), false);
  assert.equal(deviceExists({}, 'pc1'), true, 'aucune source pour vérifier : accepté');
});

test('un clic sur un équipement (évènement du pôle render) le sélectionne et le met en surbrillance', async (t) => {
  const { app, render } = await fakeApp(t);
  const changes = [];
  app.ui.onChange((id) => changes.push(id));

  render.simulateClick('pc1');
  assert.equal(app.ui.getSelection(), 'pc1');
  render.simulateClick('r1');
  assert.equal(app.ui.getSelection(), 'r1');

  assert.deepEqual(changes, ['pc1', 'r1']);
  assert.deepEqual(highlights(render), [['pc1', 'selected'], ['pc1', 'normal'], ['r1', 'selected']]);
});

test('le pôle xr peut sélectionner par app.ui.select(id) ; un id inconnu est refusé', async (t) => {
  const { app } = await fakeApp(t);
  assert.equal(app.ui.select('pc2'), true);
  assert.equal(app.ui.getSelection(), 'pc2');
  assert.equal(app.ui.select('n-existe-pas'), false);
  assert.equal(app.ui.getSelection(), 'pc2');
});

test('Échap désélectionne, sauf dans un champ de saisie', async (t) => {
  const { app, doc } = await fakeApp(t);
  app.ui.select('sw1');

  // Frappe dans un champ : la cible de l'évènement est l'input (dans le navigateur, l'évènement
  // remonte jusqu'au document en gardant cette cible).
  const inField = keydown('Escape');
  Object.defineProperty(inField, 'target', { value: { tagName: 'INPUT' } });
  doc.dispatchEvent(inField);
  assert.equal(app.ui.getSelection(), 'sw1', 'Échap dans un champ de saisie ne désélectionne pas');

  const escape = keydown('Escape');
  doc.dispatchEvent(escape);
  assert.equal(app.ui.getSelection(), null);
  assert.equal(escape.defaultPrevented, true);

  const again = keydown('Escape');
  doc.dispatchEvent(again);
  assert.equal(again.defaultPrevented, false, 'sans sélection, Échap garde son rôle normal');
});

test('le chargement d\'un nouveau scénario retire la sélection', async (t) => {
  const { app, render } = await fakeApp(t);
  app.ui.select('pc1');
  const changes = [];
  app.ui.onChange((id, previous) => changes.push([id, previous]));

  await app.sim.load(OTHER_SCENARIO);
  assert.equal(app.ui.getSelection(), null);
  assert.deepEqual(changes, [[null, 'pc1']]);
  assert.deepEqual(highlights(render).at(-1), ['pc1', 'normal']);

  // La réinitialisation, elle, garde la sélection : la topologie ne change pas.
  render.loadTopology(app.sim.getScenario());
  app.ui.select('a');
  app.sim.reset();
  assert.equal(app.ui.getSelection(), 'a');
});

test('attachSelection renvoie une fonction qui débranche tout', async () => {
  const sim = createMockSimulation({ scheduler: silentScheduler });
  await sim.load(DEMO_SCENARIO);
  const { doc, scene } = fakeDocument();
  const selection = createSelection();
  const detach = attachSelection({ sim }, selection, { root: doc });

  detach();
  scene.dispatchEvent(new CustomEvent(DEVICE_SELECTED_EVENT, { detail: { id: 'pc1' } }));
  assert.equal(selection.getSelection(), null);
  selection.select('pc1');
  await sim.load(DEMO_SCENARIO);
  doc.dispatchEvent(keydown('Escape'));
  assert.equal(selection.getSelection(), 'pc1');
});

test('aucun crash si app est vide ou sans document : l\'API de sélection existe quand même', async (t) => {
  t.mock.method(console, 'warn', () => {});
  for (const app of [undefined, {}, { sim: {}, render: {} }]) {
    const ui = await init(app, { root: undefined });
    assert.equal(ui.select('pc1'), true, 'sans source pour vérifier, l\'id est accepté');
    assert.equal(ui.getSelection(), 'pc1');
    assert.equal(ui.clear(), true);
    assert.equal(typeof ui.onChange(() => {}), 'function');
  }
});
