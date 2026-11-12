// Tests de la fiche d'équipement (phase 5) : modèle, ports, débits en direct. Vrai moteur, sans DOM.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createSimulation, createTrafficMeter, transmissionModel, TOPICS } from '../../simulation.js';
import { DEVICE_BEHAVIOURS } from '../sim/devices/index.js';
import { datasheetView, formatPercent, formatRate, loadLevel, TIME_NOTE } from './datasheet.js';

/** Comme src/sim/index.js : moteur avec transmission, compteur et getTraffic(). */
async function debitSim() {
  const scenario = JSON.parse(await readFile(new URL('../../scenarios/debit.json', import.meta.url), 'utf8'));
  const sim = createSimulation({ devices: DEVICE_BEHAVIOURS, transmission: transmissionModel, scheduler: { start: () => () => {} } });
  const meter = createTrafficMeter();
  sim.on(TOPICS.NETWORK, (event) => meter.add(event));
  sim.on(TOPICS.RESET, () => meter.reset());
  await sim.load(scenario);
  return { ...sim, getTraffic: () => meter.snapshot(sim.getScenario(), sim.getState().time) };
}

test('formats : débit, pourcentage, niveau de charge', () => {
  assert.equal(formatRate(0), '0 Mb/s');
  assert.equal(formatRate(0.84), '0,8 Mb/s');
  assert.equal(formatRate(98.2), '98 Mb/s');
  assert.equal(formatRate(1250), '1,25 Gb/s');
  assert.equal(formatPercent(0.983), '98 %');
  assert.equal(formatPercent(0.004), '0,4 %');
  assert.deepEqual([0, 0.2, 0.6, 0.95].map(loadLevel), ['idle', 'low', 'medium', 'high']);
});

test('fiche au repos : modèle, caractéristiques, ports reliés et libres, aucun trafic', async () => {
  const sim = await debitSim();
  const sheet = datasheetView({ sim }, 'sw1');
  assert.deepEqual(sheet.model, { name: 'Switch d\'accès 24 ports Gigabit', reference: 'ACC-24G', description: sheet.model.description });
  assert.ok(sheet.specs.some((row) => row.label === 'Capacité de commutation' && row.value === '128 Gb/s'));
  assert.deepEqual(sheet.ports.map((port) => `${port.name} ${port.speed} ${port.state} ${port.peer}`), [
    'p1 1 Gb/s connecté PC 1 (eth0)', 'p2 1 Gb/s connecté PC 2 (eth0)', 'p3 1 Gb/s connecté PC 3 (eth0)', 'p4 1 Gb/s connecté Serveur de sauvegarde (eth0)',
  ]);
  assert.equal(sheet.ports[3].negotiated, '100 Mb/s', 'câble catégorie 5 : port à 100 Mb/s');
  assert.equal(sheet.ports[3].cable, 'Cuivre catégorie 5');
  assert.equal(sheet.freePorts, 24, '28 ports sur le modèle, 4 utilisés');
  assert.equal(sheet.totals.current, '0 Mb/s');
  assert.equal(sheet.totals.bandwidth, '6,2 Gb/s', '(3 × 1 Gb/s + 100 Mb/s) × 2');
  assert.equal(sheet.note, TIME_NOTE);
  assert.equal(datasheetView({ sim }, 'inconnu'), null);
});

test('fiche en cours de transfert : le port vers le serveur est presque plein', async () => {
  const sim = await debitSim();
  while (sim.getState().time < 6000) sim.step();
  const sheet = datasheetView({ sim }, 'sw1');
  const uplink = sheet.ports.find((port) => port.name === 'p4');
  assert.ok(uplink.utilization > 0.9, String(uplink.utilization));
  assert.equal(uplink.level, 'high');
  assert.ok(sheet.ports.filter((port) => port.name !== 'p4').every((port) => port.utilization < 0.2));
  assert.notEqual(sheet.totals.current, '0 Mb/s');
});

test('sans mesure (faux moteur) : fiche sans débits, sans erreur', async () => {
  const { createMockSimulation, DEMO_SCENARIO } = await import('../../simulation.js');
  const sim = createMockSimulation({ scheduler: { start: () => () => {} } });
  await sim.load(DEMO_SCENARIO);
  const sheet = datasheetView({ sim }, 'r1');
  assert.equal(sheet.model, null);
  assert.equal(sheet.totals, null);
  assert.equal(sheet.note, null);
  assert.deepEqual(sheet.ports.map((port) => port.current), ['0 Mb/s', '0 Mb/s']);
});
