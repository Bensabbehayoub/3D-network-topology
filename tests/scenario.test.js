// Tests du format de scénario et de son validateur.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { DEMO_SCENARIO } from '../src/sim/mock.js';
import {
  assertScenario, findPath, linkAt, neighbours, parseCidr, parseEndpoint, validateScenario,
} from '../src/sim/scenario.js';

const readScenario = async (name) =>
  JSON.parse(await readFile(new URL(`../scenarios/${name}.json`, import.meta.url), 'utf8'));

const copy = (value) => structuredClone(value);

test('scenarios/arp.json respecte le format', async () => {
  const result = validateScenario(await readScenario('arp'));
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('scenarios/index.json : chaque scénario listé est valide et porte le nom de son fichier', async () => {
  const index = JSON.parse(await readFile(new URL('../scenarios/index.json', import.meta.url), 'utf8'));
  assert.ok(index.scenarios.length >= 4);
  for (const id of index.scenarios) {
    const scenario = await readScenario(id);
    assert.deepEqual(validateScenario(scenario).errors, [], id);
    assert.equal(scenario.id, id);
  }
});

test('routes statiques : réseau CIDR et routeur suivant vérifiés', () => {
  const scenario = copy(DEMO_SCENARIO);
  const router = scenario.devices.find((d) => d.type === 'router');
  router.routes = [{ network: '10.0.0.0/8', via: '192.168.2.254' }];
  assert.deepEqual(validateScenario(scenario).errors, []);
  router.routes = [{ network: '10.0.0.0', via: 'routeur' }];
  assert.equal(validateScenario(scenario).errors.length, 2);
  router.routes = 'aucune';
  assert.match(validateScenario(scenario).errors[0], /routes : tableau attendu/);
});

test('le scénario de démonstration du mock respecte le format', () => {
  assert.deepEqual(validateScenario(DEMO_SCENARIO).errors, []);
});

test('un scénario vide signale chaque champ obligatoire', () => {
  const { ok, errors } = validateScenario({});
  assert.equal(ok, false);
  for (const field of ['schema', 'id', 'title', 'protocol', 'devices', 'links', 'steps']) {
    assert.ok(errors.some((message) => message.startsWith(field)), `aucune erreur pour ${field}`);
  }
  assert.equal(validateScenario(null).ok, false);
  assert.equal(validateScenario([]).ok, false);
});

test('les erreurs d\'équipement et d\'interface sont nommées', () => {
  const scenario = copy(DEMO_SCENARIO);
  scenario.devices[0].type = 'imprimante';
  scenario.devices[0].interfaces[0].mac = '02:00:00:00:01';
  scenario.devices[0].interfaces[0].ip = '192.168.1.300/24';
  scenario.devices[2].interfaces[1].mac = undefined;
  scenario.devices.push({ ...copy(scenario.devices[1]) });
  const { errors } = validateScenario(scenario);

  assert.ok(errors.some((e) => e.includes('(pc1).type')));
  assert.ok(errors.some((e) => e.includes('(pc1).interfaces[0].mac')));
  assert.ok(errors.some((e) => e.includes('(pc1).interfaces[0].ip')));
  assert.ok(errors.some((e) => e.includes('(r1).interfaces[1].mac : obligatoire')));
  assert.ok(errors.some((e) => e.includes('(sw1) : id en double')));
});

test('les liens doivent viser des interfaces existantes, libres, sur deux équipements différents', () => {
  const scenario = copy(DEMO_SCENARIO);
  scenario.links.push(
    { id: 'l5', a: 'pc9:eth0', b: 'sw1:p1' },
    { id: 'l6', a: 'pc1:eth9', b: 'sw2:p1' },
    { id: 'l7', a: 'pc1:eth0', b: 'r1:g1' },
    { id: 'l8', a: 'sw1:p1', b: 'sw1:p2' },
    { id: 'l1', a: 'pc1', b: 'sw2:p2', latency: -5 },
  );
  const { errors } = validateScenario(scenario);
  assert.ok(errors.some((e) => e.includes('équipement "pc9" inconnu')));
  assert.ok(errors.some((e) => e.includes('interface "eth9" absente de pc1')));
  assert.ok(errors.some((e) => e.includes('pc1:eth0 déjà relié par l1')));
  assert.ok(errors.some((e) => e.includes('deux équipements différents')));
  assert.ok(errors.some((e) => e.includes('(l1) : id en double')));
  assert.ok(errors.some((e) => e.includes('"équipement:interface" attendu')));
  assert.ok(errors.some((e) => e.includes('latency')));
});

test('une MAC ne peut appartenir qu\'à une interface', () => {
  const scenario = copy(DEMO_SCENARIO);
  scenario.devices[4].interfaces[0].mac = scenario.devices[0].interfaces[0].mac.toUpperCase();
  assert.ok(validateScenario(scenario).errors.some((e) => e.includes('utilisée deux fois')));
});

test('chaque étape a un id unique, un titre et un texte', () => {
  const scenario = copy(DEMO_SCENARIO);
  scenario.steps.push({ id: 'demo-request', title: '', text: '' });
  const { errors } = validateScenario(scenario);
  assert.ok(errors.some((e) => e.includes('id en double')));
  assert.ok(errors.some((e) => e.includes('.title')));
  assert.ok(errors.some((e) => e.includes('.text')));
});

test('assertScenario lève une erreur listant les problèmes', () => {
  assert.throws(() => assertScenario({ id: 'x' }), /scénario "x" invalide :\n- /);
  assert.equal(assertScenario(DEMO_SCENARIO), DEMO_SCENARIO);
});

test('aides de lecture : parseCidr, parseEndpoint, linkAt, neighbours', () => {
  assert.deepEqual(parseCidr('10.0.0.1/8'), { address: '10.0.0.1', prefix: 8 });
  assert.equal(parseCidr('10.0.0.1'), null);
  assert.equal(parseCidr('10.0.0.1/33'), null);
  assert.deepEqual(parseEndpoint('sw1:fa0/1'), { device: 'sw1', interface: 'fa0/1' });
  assert.equal(parseEndpoint(':eth0'), null);

  const at = linkAt(DEMO_SCENARIO, 'r1', 'g1');
  assert.equal(at.link.id, 'l3');
  assert.deepEqual(at.peer, { device: 'sw2', interface: 'p1' });
  assert.deepEqual(neighbours(DEMO_SCENARIO, 'r1').map((n) => n.peer.device), ['sw1', 'sw2']);
});

test('findPath donne le plus court chemin, saut par saut', () => {
  const path = findPath(DEMO_SCENARIO, 'pc1', 'pc2');
  assert.deepEqual(path.map((hop) => `${hop.device}:${hop.interface}>${hop.next}`),
    ['pc1:eth0>sw1', 'sw1:p2>r1', 'r1:g1>sw2', 'sw2:p2>pc2']);
  assert.deepEqual(findPath(DEMO_SCENARIO, 'pc1', 'pc1'), []);

  const cut = copy(DEMO_SCENARIO);
  cut.links = cut.links.filter((link) => link.id !== 'l3');
  assert.equal(findPath(cut, 'pc1', 'pc2'), null);
});
