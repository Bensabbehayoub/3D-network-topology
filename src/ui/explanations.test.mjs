// Tests du panneau Explications (phase 4d) : bloc d'explication et journal, sans DOM.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createSimulation, TOPICS } from '../../simulation.js';
import { DEVICE_BEHAVIOURS } from '../sim/devices/index.js';
import { createLogModel, explanationView, HINT, mount } from './explanations.js';

async function pingSim() {
  const scenario = JSON.parse(await readFile(new URL('../../scenarios/ping.json', import.meta.url), 'utf8'));
  const sim = createSimulation({ devices: DEVICE_BEHAVIOURS, scheduler: { start: () => () => {} } });
  await sim.load(scenario);
  return { sim, scenario };
}

test('explication : description du scénario, puis étape avec son instant', () => {
  const scenario = { title: 'Ping', description: 'Deux réseaux.' };
  assert.deepEqual(explanationView(scenario, null), { heading: 'Ping', title: 'Présentation', text: 'Deux réseaux.', time: null, hint: true });
  assert.deepEqual(explanationView(scenario, { time: 1600, title: 'ARP', text: 'Qui a…' }), { heading: 'Ping', title: 'ARP', text: 'Qui a…', time: '1,6 s', hint: false });
  assert.equal(explanationView(null, null).text, HINT);
});

test('journal : suit le moteur, reprend l\'historique, se vide à la réinitialisation', async () => {
  const { sim } = await pingSim();
  for (let i = 0; i < 4; i += 1) sim.step();
  const added = [];
  let cleared = 0;
  const log = createLogModel(sim, { onAdd: (entry) => added.push(entry), onClear: () => { cleared += 1; } });
  const before = log.entries().length;
  assert.ok(before > 0, 'monté en retard : l\'historique est repris');
  while (sim.getState().status !== 'finished') sim.step();
  const entries = log.entries();
  assert.ok(entries.length > before);
  assert.ok(entries.every((entry) => entry.kind === 'send' || entry.kind === 'drop'));
  assert.deepEqual(entries.map((entry) => entry.eventId), [...entries.map((entry) => entry.eventId)].sort((a, b) => a - b), 'dans l\'ordre');
  assert.ok(entries.some((entry) => entry.label === 'ICMP réponse d\'écho' && entry.route === 'Routeur → Switch 1'));
  sim.reset();
  assert.equal(cleared, 1);
  assert.equal(log.entries().length, 0);
  log.dispose();
});

test('mount sous Node : gabarit fixe, explication et journal tenus à jour', async () => {
  const { sim, scenario } = await pingSim();
  const panel = mount({ innerHTML: '' }, { sim });
  assert.equal(panel.getView().text, scenario.description);
  let steps = 0;
  sim.on(TOPICS.STEP, () => { steps += 1; });
  sim.step();
  assert.ok(steps > 0);
  assert.equal(panel.getView().hint, false);
  assert.ok(panel.getLog().length > 0);
  sim.reset();
  assert.equal(panel.getView().hint, true);
  assert.equal(panel.getLog().length, 0);
  panel.dispose();
});
