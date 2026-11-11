// Tests du panneau d'infos de l'équipement sélectionné (Ramy, tâche 19). Sans DOM : on teste les
// fonctions pures avec le vrai faux moteur, et le rendu avec un faux document minimal.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createMockRenderer } from '../render/mock.js';
import { createMockSimulation, DEMO_SCENARIO } from '../../simulation.js';
import { describeSelection, deviceInfo, findDevice, mount, renderDeviceInfo } from './inspector.js';
import { createSelection } from './selection.js';

const silentScheduler = { start: () => () => {} };

async function loadedSim(scenario = DEMO_SCENARIO) {
  const sim = createMockSimulation({ scheduler: silentScheduler });
  await sim.load(scenario);
  return sim;
}

/** Faux document : éléments avec append, textContent, className, setAttribute. Pas de parseur HTML. */
function fakeDocument() {
  class FakeElement {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.className = '';
      this.attributes = {};
      this.children = [];
      this.ownText = '';
    }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    set textContent(value) { this.ownText = String(value); this.children = []; }
    get textContent() { return this.ownText + this.children.map((child) => child.textContent).join(''); }
    findAll(tag) {
      const own = this.tagName === tag.toUpperCase() ? [this] : [];
      return [...own, ...this.children.flatMap((child) => child.findAll(tag))];
    }
  }
  return { createElement: (tag) => new FakeElement(tag) };
}

test('infos de PC 1 : nom, type, IP, MAC et passerelle tirées du scénario du moteur', async () => {
  const sim = await loadedSim();
  const match = findDevice({ sim }, 'pc1');
  assert.equal(match.source, 'scenario');

  const info = deviceInfo(match.device);
  assert.equal(info.title, 'PC 1');
  assert.deepEqual(info.props, [
    { label: 'Type', value: 'Ordinateur' },
    { label: 'Identifiant', value: 'pc1' },
    { label: 'Passerelle', value: '192.168.1.1' },
  ]);
  assert.deepEqual(info.interfaces, [{ name: 'eth0', ip: '192.168.1.10/24', mac: '02:00:00:00:01:01' }]);
});

test('routeur : une ligne par interface, pas de passerelle', async () => {
  const sim = await loadedSim();
  const info = deviceInfo(findDevice({ sim }, 'r1').device);
  assert.equal(info.title, 'Routeur');
  assert.equal(info.props[0].value, 'Routeur');
  assert.ok(!info.props.some((prop) => prop.label === 'Passerelle'));
  assert.deepEqual(info.interfaces, [
    { name: 'g0', ip: '192.168.1.1/24', mac: '02:00:00:00:00:a0' },
    { name: 'g1', ip: '192.168.2.1/24', mac: '02:00:00:00:00:a1' },
  ]);
});

test('switch : ports sans adresse affichés avec un tiret ; équipement sans label : son id', () => {
  const info = deviceInfo({ id: 'sw9', type: 'switch', interfaces: [{ name: 'p1' }] });
  assert.equal(info.title, 'sw9');
  assert.equal(info.props[0].value, 'Switch');
  assert.deepEqual(info.interfaces, [{ name: 'p1', ip: '—', mac: '—' }]);
  assert.deepEqual(deviceInfo(undefined).interfaces, []);
});

test('repli sur la scène 3D quand le moteur ne connaît pas l\'équipement', () => {
  const render = createMockRenderer();
  render.loadTopology({ devices: [{ id: 'pc-1', type: 'pc', label: 'PC 1', ip: '192.168.1.10' }, { id: 'sw-1', type: 'switch' }], links: [] });

  const pc = findDevice({ render }, 'pc-1');
  assert.equal(pc.source, 'render');
  assert.deepEqual(deviceInfo(pc.device).interfaces, [{ name: '—', ip: '192.168.1.10', mac: '—' }]);
  assert.deepEqual(deviceInfo(findDevice({ render }, 'sw-1').device).interfaces, []);
  assert.equal(findDevice({ render }, 'inconnu'), null);
});

test('describeSelection : rien, introuvable ou trouvé ; jamais d\'erreur si app est vide', async () => {
  const sim = await loadedSim();
  assert.equal(describeSelection({ sim }, null), null);
  assert.deepEqual(describeSelection({ sim }, 'zz'), { id: 'zz', found: false });
  assert.equal(describeSelection({ sim }, 'pc2').info.title, 'PC 2');
  for (const app of [undefined, {}, { sim: {}, render: {} }, { sim: { getScenario() { throw new Error('panne'); } } }]) {
    assert.deepEqual(describeSelection(app, 'pc1'), { id: 'pc1', found: false });
  }
});

test('le panneau suit la sélection (selection.onChange), et revient au message d\'attente sans sélection', async () => {
  const sim = await loadedSim();
  const selection = createSelection();
  const container = { innerHTML: '' };
  const inspector = mount(container, { sim }, { selection });

  assert.equal(inspector.getView(), null);
  assert.match(container.innerHTML, /Sélectionnez un paquet/);
  assert.match(container.innerHTML, /data-role="packet"/, 'la zone du paquet (S3) est gardée');

  selection.select('pc1');
  assert.equal(inspector.getView().info.title, 'PC 1');
  selection.select('sw1');
  assert.equal(inspector.getView().info.title, 'Switch 1');
  selection.clear();
  assert.equal(inspector.getView(), null);

  inspector.destroy();
  selection.select('pc1');
  assert.equal(inspector.getView(), null, 'plus de mise à jour après destroy()');
});

test('mount sans service de sélection (appel S1) : message d\'attente, aucune erreur', () => {
  const container = { innerHTML: '' };
  const inspector = mount(container, {});
  assert.equal(inspector.getView(), null);
  assert.match(container.innerHTML, /Sélectionnez un paquet/);
});

test('rendu : nom, propriétés et tableau des interfaces écrits en texte', async () => {
  const sim = await loadedSim();
  const node = renderDeviceInfo(fakeDocument(), describeSelection({ sim }, 'pc1'));

  assert.equal(node.findAll('h3')[0].textContent, 'PC 1');
  assert.deepEqual(node.findAll('dt').map((dt) => dt.textContent), ['Type', 'Identifiant', 'Passerelle']);
  assert.deepEqual(node.findAll('dd').map((dd) => dd.textContent), ['Ordinateur', 'pc1', '192.168.1.1']);
  assert.deepEqual(node.findAll('td').map((td) => td.textContent), ['eth0', '192.168.1.10/24', '02:00:00:00:01:01']);
  assert.ok(node.findAll('th').every((th) => th.attributes.scope === 'col'));

  const missing = renderDeviceInfo(fakeDocument(), { id: 'x', found: false });
  assert.match(missing.textContent, /« x » introuvable/);
});

test('un label piégé reste du texte (textContent), jamais du HTML', async () => {
  const hostile = '<img src=x onerror="alert(1)">';
  const node = renderDeviceInfo(fakeDocument(), { id: 'h', found: true, source: 'scenario',
    info: deviceInfo({ id: 'h', type: 'host', label: hostile, interfaces: [] }) });
  assert.equal(node.findAll('h3')[0].textContent, hostile);
  assert.equal(node.findAll('img').length, 0);

  // innerHTML n'est utilisé qu'une fois, pour le gabarit statique.
  const source = await readFile(new URL('./inspector.js', import.meta.url), 'utf8');
  const uses = source.match(/\.innerHTML\s*=/g) ?? [];
  assert.deepEqual(uses.length, 1);
  assert.match(source, /container\.innerHTML = TEMPLATE;/);
});
