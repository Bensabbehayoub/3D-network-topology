// Tests du catalogue d'équipements et de câbles (src/sim/catalog.js), et de sa validation.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CABLES, DEFAULT_SPEED, formatSpeed, forwardingRateMpps, MODELS, modelOf, modelPorts, modelSheet, portConnector, portSpeed, SPEEDS,
} from '../src/sim/catalog.js';
import { DEVICE_TYPES, validateScenario } from '../src/sim/scenario.js';
import { DEMO_SCENARIO } from '../src/sim/mock.js';

test('chaque modèle est cohérent : type connu, ports à des vitesses acceptées, fiche complète', () => {
  for (const [id, model] of Object.entries(MODELS)) {
    assert.ok(DEVICE_TYPES.includes(model.type), id);
    assert.ok(model.name && model.reference && model.description, id);
    assert.ok(model.ports.length > 0 && model.ports.every((group) => SPEEDS.includes(group.speed) && group.count > 0), id);
    assert.ok(model.specs.power && model.specs.format, id);
  }
  for (const type of DEVICE_TYPES) assert.ok(Object.values(MODELS).some((model) => model.type === type), `au moins un modèle ${type}`);
});

test('valeurs réalistes : capacité de commutation et débit de transfert calculés', () => {
  assert.ok(Math.abs(forwardingRateMpps(1000) - 1.488) < 0.001, '1,488 Mpps par port Gigabit');
  const sheet = Object.fromEntries(modelSheet(MODELS['sw-24g']).map((row) => [row.label, row.value]));
  assert.equal(sheet.Ports, '24 × 1 Gb/s RJ45 + 4 × 10 Gb/s SFP+');
  assert.equal(sheet['Capacité de commutation'], '128 Gb/s', '(24 × 1 + 4 × 10) × 2');
  assert.equal(sheet['Débit de transfert'], '95,2 Mpps');
  assert.equal(sheet['Table d\'adresses MAC'], '16 384 entrées');
  const router = Object.fromEntries(modelSheet(MODELS['rt-4g']).map((row) => [row.label, row.value]));
  assert.equal(router['Débit de routage'], '1 Gb/s');
  assert.deepEqual(modelSheet(null), []);
});

test('vitesse d\'un port : champ speed, sinon modèle (ports dans l\'ordre), sinon 1 Gb/s', () => {
  const sw = { model: 'sw-24g', interfaces: Array.from({ length: 26 }, (_, i) => ({ name: `p${i + 1}` })) };
  assert.equal(portSpeed(sw, 'p1'), 1000);
  assert.equal(portSpeed(sw, 'p25'), 10000, 'le 25e port est un port 10 Gb/s');
  assert.equal(portConnector(sw, 'p25'), 'SFP+');
  sw.interfaces[0].speed = 100;
  assert.equal(portSpeed(sw, 'p1'), 100);
  assert.equal(portSpeed({ interfaces: [{ name: 'eth0' }] }, 'eth0'), DEFAULT_SPEED);
  assert.equal(modelPorts(MODELS['sw-24g']).length, 28);
  assert.equal(modelOf({ model: 'inconnu' }), null);
  assert.equal(CABLES['cuivre-cat5'].maxSpeed, 100);
});

test('formats : vitesses et nombres à la française', () => {
  assert.equal(formatSpeed(100), '100 Mb/s');
  assert.equal(formatSpeed(1000), '1 Gb/s');
  assert.equal(formatSpeed(2500), '2,5 Gb/s');
  assert.equal(formatSpeed(0), '0 Mb/s');
});

test('validation : modèle connu et du bon type, ports en nombre suffisant, vitesses, câbles', () => {
  const scenario = structuredClone(DEMO_SCENARIO);
  scenario.devices.find((d) => d.id === 'r1').model = 'rt-4g';
  scenario.devices.find((d) => d.id === 'pc1').interfaces[0].speed = 100;
  scenario.links[0].bandwidth = 100;
  scenario.links[0].cable = 'cuivre-cat5e';
  assert.deepEqual(validateScenario(scenario).errors, []);
  scenario.devices.find((d) => d.id === 'r1').model = 'sw-24g';
  scenario.devices.find((d) => d.id === 'sw1').model = 'pc-1g';
  scenario.devices.find((d) => d.id === 'pc2').model = 'inexistant';
  scenario.devices.find((d) => d.id === 'pc1').interfaces[0].speed = 400;
  scenario.links[0].bandwidth = 2500;
  scenario.links[0].cable = 'ficelle';
  const errors = validateScenario(scenario).errors.join('\n');
  for (const fragment of ['modèle de type switch, pas router', 'modèle de type host, pas switch', 'interfaces pour un modèle à 1 ports', 'modèle inconnu', '.speed', '.bandwidth', '.cable']) {
    assert.ok(errors.includes(fragment), fragment);
  }
});
