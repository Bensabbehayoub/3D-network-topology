// Tests du faux moteur et de l'initialisation du pôle sim.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { init } from '../src/sim/index.js';
import { createMockSimulation, DEMO_SCENARIO } from '../src/sim/mock.js';
import { STATUS, TOPICS } from '../simulation.js';

const manual = { start: () => () => {} };

function collect(sim) {
  const network = [];
  const steps = [];
  sim.on(TOPICS.NETWORK, (e) => network.push(`${e.type} ${e.source}>${e.destination} ${e.packet.type} ttl=${e.packet.ip?.ttl}`));
  sim.on(TOPICS.STEP, ({ step }) => steps.push(step));
  return { network, steps };
}

test('init renvoie un faux moteur déjà chargé avec la démo', async () => {
  const sim = await init({}, { options: { scheduler: manual } });
  assert.equal(sim.mock, true);
  assert.equal(sim.getScenario().id, 'demo');
  assert.equal(sim.getState().status, STATUS.READY);
  for (const method of ['load', 'play', 'pause', 'step', 'setSpeed', 'reset', 'getState', 'describe', 'on', 'isAllowed']) {
    assert.equal(typeof sim[method], 'function', method);
  }
});

test('la démo fait un aller-retour pc1 ⇄ pc2 et le routeur décrémente le TTL', async () => {
  const sim = createMockSimulation({ scheduler: manual });
  const { network, steps } = collect(sim);
  await sim.load(DEMO_SCENARIO);
  while (sim.step());

  const sends = network.filter((line) => line.startsWith('send'));
  assert.deepEqual(sends, [
    'send pc1>sw1 request ttl=64',
    'send sw1>r1 request ttl=64',
    'send r1>sw2 request ttl=63',
    'send sw2>pc2 request ttl=63',
    'send pc2>sw2 reply ttl=64',
    'send sw2>r1 reply ttl=64',
    'send r1>sw1 reply ttl=63',
    'send sw1>pc1 reply ttl=63',
  ]);
  assert.deepEqual(steps, ['demo-request', 'demo-reply', 'demo-done']);
  assert.equal(sim.getState().status, STATUS.FINISHED);
});

test('le faux moteur joue n\'importe quel scénario valide, avec ses propres explications', async () => {
  const arp = JSON.parse(await readFile(new URL('../scenarios/arp.json', import.meta.url), 'utf8'));
  const sim = createMockSimulation({ scheduler: manual });
  const { network, steps } = collect(sim);
  await sim.load(arp, { target: 'pc3' });
  while (sim.step());
  assert.ok(network.includes('send sw1>pc3 request ttl=64'), 'params passés à load() pris en compte');
  assert.equal(steps[0], 'arp-cache-miss');
});
