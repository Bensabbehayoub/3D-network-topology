// Tests du faux moteur et de l'initialisation du pôle sim.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { init } from '../src/sim/index.js';
import { createMockSimulation, DEMO_PROTOCOL, DEMO_SCENARIO } from '../src/sim/mock.js';
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

// --- S2 : contrat du bus vu par le rendu et l'interface ---

import { createSimulation } from '../src/sim/commands.js';

/** Horloge manuelle : frame(ms) joue une image. */
function manualScheduler() {
  let onFrame = null;
  return { start(cb) { onFrame = cb; return () => { onFrame = null; }; }, frame(ms) { onFrame?.(ms); } };
}

const signature = (e) => `${e.time} ${e.type} ${e.source}>${e.destination} ${e.packet.id}:${e.packet.type} step=${e.step}`;

async function runWith(drive) {
  const scheduler = manualScheduler();
  const sim = createMockSimulation({ scheduler });
  const events = [];
  sim.on(TOPICS.NETWORK, (e) => events.push(signature(e)));
  sim.on(TOPICS.STEP, ({ time, step }) => events.push(`${time} STEP ${step}`));
  await sim.load(DEMO_SCENARIO);
  await drive(sim, scheduler);
  assert.equal(sim.getState().status, STATUS.FINISHED);
  return events;
}

test('lecture continue, images irrégulières, vitesses variées et pas à pas donnent la même séquence', async () => {
  const stepped = await runWith((sim) => { while (sim.step()); });
  const played = await runWith((sim, scheduler) => {
    sim.play();
    const frames = [16, 33, 7, 100, 1, 250, 16];
    for (let i = 0; sim.getState().status === STATUS.PLAYING; i++) scheduler.frame(frames[i % frames.length]);
  });
  const fast = await runWith((sim, scheduler) => {
    sim.setSpeed(4);
    sim.play();
    while (sim.getState().status === STATUS.PLAYING) scheduler.frame(16);
  });
  const mixed = await runWith((sim, scheduler) => {
    sim.step();
    sim.play();
    scheduler.frame(500);
    sim.pause();
    sim.step();
    sim.step();
    sim.play();
    while (sim.getState().status === STATUS.PLAYING) scheduler.frame(40);
  });
  assert.ok(stepped.length > 10);
  assert.deepEqual(played, stepped);
  assert.deepEqual(fast, stepped);
  assert.deepEqual(mixed, stepped);
});

test('ordre des messages au chargement puis à chaque pas : SCENARIO, RESET, STATE ; puis STEP/NETWORK, TICK, STATE', async () => {
  const sim = createMockSimulation({ scheduler: manualScheduler() });
  const topics = [];
  for (const topic of Object.values(TOPICS)) sim.on(topic, () => topics.push(topic));
  await sim.load(DEMO_SCENARIO);
  assert.deepEqual(topics, [TOPICS.SCENARIO, TOPICS.RESET, TOPICS.STATE]);

  topics.length = 0;
  sim.step();
  assert.deepEqual(topics, [TOPICS.STEP, TOPICS.NETWORK, TOPICS.TICK, TOPICS.STATE]);

  topics.length = 0;
  sim.reset();
  assert.deepEqual(topics, [TOPICS.RESET, TOPICS.STATE]);
});

test('un module monté en retard se remet à jour avec getHistory puis suit le bus', async () => {
  const sim = createMockSimulation({ scheduler: manualScheduler() });
  await sim.load(DEMO_SCENARIO);
  sim.step();
  sim.step();
  const journal = sim.getHistory().map(signature);
  sim.on(TOPICS.NETWORK, (e) => journal.push(signature(e)));
  while (sim.step());
  const reference = await runWith((s) => { while (s.step()); });
  assert.deepEqual(journal, reference.filter((line) => !line.includes('STEP')));
});

test('un nouveau chargement repart d\'un historique vide', async () => {
  const sim = createSimulation({ protocol: DEMO_PROTOCOL, scheduler: manualScheduler() });
  await sim.load(DEMO_SCENARIO);
  while (sim.step());
  assert.equal(sim.getHistory().filter((e) => e.type === 'send').length, 8);
  await sim.load(DEMO_SCENARIO, { target: 'pc1', source: 'pc2' });
  assert.deepEqual(sim.getHistory(), [], 'un nouveau chargement repart d\'un historique vide');
});
