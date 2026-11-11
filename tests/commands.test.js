// Tests de l'API de commandes et du contexte donné aux protocoles, avec un protocole factice.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSimulation, MAX_SPEED, MIN_SPEED } from '../src/sim/commands.js';
import { TOPICS } from '../src/sim/events.js';
import { COMMANDS, STATUS } from '../src/sim/state.js';

// Deux PC reliés directement, latence 100 ms.
const SCENARIO = {
  schema: 1,
  id: 'echo',
  title: 'Écho',
  protocol: 'echo',
  params: { source: 'a', target: 'b' },
  devices: [
    { id: 'a', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:00:0a', ip: '10.0.0.1/24' }] },
    { id: 'b', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:00:0b', ip: '10.0.0.2/24' }] },
  ],
  links: [{ id: 'ab', a: 'a:eth0', b: 'b:eth0', latency: 100 }],
  steps: [
    { id: 'ask', title: 'Question', text: 'a interroge b.' },
    { id: 'answer', title: 'Réponse', text: 'b répond à a.' },
  ],
};

// Protocole factice : a envoie une question, b répond, a compte les réponses dans sa mémoire.
const ECHO = {
  name: 'echo',
  start(ctx) {
    ctx.explain('ask');
    ctx.send(ctx.params.source, { id: ctx.nextPacketId(), protocol: 'echo', type: 'ask' }, { step: 'ask' });
  },
  onReceive(device, packet, ctx) {
    if (packet.type === 'ask') {
      ctx.explain('answer');
      ctx.send(device.id, { id: ctx.nextPacketId(), protocol: 'echo', type: 'answer' }, { step: 'answer' });
    } else {
      const memory = ctx.memory(device.id);
      memory.answers = (memory.answers ?? 0) + 1;
    }
  },
  describe: (packet) => [{ layer: 'Écho', field: 'Type', value: packet.type }],
};

/** Horloge manuelle : frame(ms) simule une image de ms millisecondes réelles. */
function manualScheduler() {
  let onFrame = null;
  return {
    start(callback) { onFrame = callback; return () => { onFrame = null; }; },
    frame(ms) { onFrame?.(ms); },
    get running() { return onFrame !== null; },
  };
}

async function setup(options = {}) {
  const scheduler = manualScheduler();
  const sim = createSimulation({ protocol: ECHO, scheduler, ...options });
  const record = { network: [], steps: [], states: [], resets: 0, scenarios: [] };
  sim.on(TOPICS.NETWORK, (event) => record.network.push(`${event.time} ${event.type} ${event.source}>${event.destination} ${event.packet.type}`));
  sim.on(TOPICS.STEP, ({ step }) => record.steps.push(step));
  sim.on(TOPICS.STATE, ({ status }) => record.states.push(status));
  sim.on(TOPICS.RESET, () => record.resets++);
  sim.on(TOPICS.SCENARIO, ({ scenario }) => record.scenarios.push(scenario.id));
  await sim.load(SCENARIO);
  return { sim, scheduler, record };
}

const FULL_RUN = ['0 send a>b ask', '100 receive a>b ask', '100 send b>a answer', '200 receive b>a answer'];

test('avant tout chargement : état idle, commandes refusées sans exception', () => {
  const sim = createSimulation({ protocol: ECHO, scheduler: manualScheduler() });
  assert.equal(sim.getState().status, STATUS.IDLE);
  assert.equal(sim.play(), false);
  assert.equal(sim.step(), false);
  assert.equal(sim.reset(), false);
  assert.equal(sim.getScenario(), null);
});

test('load publie le scénario, réinitialise et passe à l\'état prêt sans rien jouer', async () => {
  const { sim, record } = await setup();
  assert.deepEqual(record.scenarios, ['echo']);
  assert.equal(record.resets, 1);
  assert.deepEqual(record.states, [STATUS.READY]);
  assert.deepEqual(record.network, []);
  assert.equal(sim.getState().time, 0);
  assert.ok(Object.isFrozen(sim.getScenario()), 'le scénario chargé est en lecture seule');
});

test('load refuse un scénario invalide', async () => {
  const sim = createSimulation({ protocol: ECHO, scheduler: manualScheduler() });
  await assert.rejects(sim.load({ ...SCENARIO, steps: [] }), /steps/);
  assert.equal(sim.getState().status, STATUS.IDLE);
});

test('pas à pas : un instant à la fois, puis terminé', async () => {
  const { sim, record } = await setup();

  assert.equal(sim.step(), true);
  assert.deepEqual(record.network, ['0 send a>b ask']);
  assert.deepEqual(record.steps, ['ask']);
  assert.equal(sim.getState().status, STATUS.PAUSED);

  sim.step();
  assert.deepEqual(record.network, FULL_RUN.slice(0, 3));
  assert.equal(sim.getState().time, 100);

  sim.step();
  assert.deepEqual(record.network, FULL_RUN);
  assert.equal(sim.getState().status, STATUS.FINISHED);
  assert.equal(sim.step(), false);
});

test('lecture continue pilotée par l\'horloge, avec la vitesse', async () => {
  const { sim, scheduler, record } = await setup();
  sim.setSpeed(2);
  assert.equal(sim.play(), true);
  assert.equal(sim.getState().status, STATUS.PLAYING);

  scheduler.frame(25); // 50 ms simulées
  assert.deepEqual(record.network, ['0 send a>b ask']);
  assert.equal(sim.getState().time, 50);

  scheduler.frame(50); // → 150 ms
  assert.deepEqual(record.network, FULL_RUN.slice(0, 3));

  scheduler.frame(50); // → 250 ms : tout est joué
  assert.deepEqual(record.network, FULL_RUN);
  assert.equal(sim.getState().status, STATUS.FINISHED);
  assert.equal(scheduler.running, false, 'la boucle s\'arrête en fin de scénario');
});

test('pause arrête l\'horloge ; lecture reprend où on en était', async () => {
  const { sim, scheduler } = await setup();
  sim.play();
  scheduler.frame(60);
  sim.pause();
  assert.equal(scheduler.running, false);
  assert.equal(sim.getState().time, 60);
  sim.play();
  scheduler.frame(60);
  assert.equal(sim.getState().time, 120);
});

test('les messages sur TICK suivent l\'horloge simulée', async () => {
  const { sim, scheduler } = await setup();
  const ticks = [];
  sim.on(TOPICS.TICK, ({ time }) => ticks.push(time));
  sim.play();
  scheduler.frame(16);
  scheduler.frame(16);
  sim.pause();
  sim.step();
  assert.deepEqual(ticks, [16, 32, 100]);
});

test('reset rejoue exactement la même séquence (mémoires vidées)', async () => {
  const { sim, record } = await setup();
  while (sim.step());
  const first = [...record.network];
  assert.equal(sim.reset(), true);
  assert.equal(sim.getState().status, STATUS.READY);
  assert.equal(sim.getState().time, 0);
  record.network.length = 0;
  while (sim.step());
  assert.deepEqual(record.network, first);
  assert.equal(record.resets, 2);
});

test('setSpeed borne la vitesse et refuse les valeurs absurdes', async () => {
  const { sim } = await setup();
  sim.setSpeed(100);
  assert.equal(sim.getState().speed, MAX_SPEED);
  sim.setSpeed(0.01);
  assert.equal(sim.getState().speed, MIN_SPEED);
  assert.throws(() => sim.setSpeed(0), RangeError);
  assert.throws(() => sim.setSpeed(Number.NaN), RangeError);
});

test('isAllowed reflète l\'état courant (activation des boutons)', async () => {
  const { sim } = await setup();
  assert.equal(sim.isAllowed(COMMANDS.PLAY), true);
  assert.equal(sim.isAllowed(COMMANDS.PAUSE), false);
  sim.play();
  assert.equal(sim.isAllowed(COMMANDS.PAUSE), true);
  assert.equal(sim.isAllowed(COMMANDS.STEP), false);
});

test('les paquets publiés sont gelés : un protocole ne peut pas modifier un paquet déjà envoyé', async () => {
  const { sim } = await setup();
  let seen = null;
  sim.on(TOPICS.NETWORK, (event) => { seen = event; });
  sim.step();
  assert.ok(Object.isFrozen(seen));
  assert.ok(Object.isFrozen(seen.packet));
  assert.equal(seen.arrival, 100);
  assert.equal(seen.link, 'ab');
  assert.equal(seen.sourceInterface, 'eth0');
  assert.equal(seen.destinationInterface, 'eth0');
  assert.equal(seen.step, 'ask');
});

test('describe passe par le protocole du paquet, sinon par les en-têtes communs', async () => {
  const { sim } = await setup();
  assert.deepEqual(sim.describe({ id: 'p1', protocol: 'echo', type: 'ask' }), [{ layer: 'Écho', field: 'Type', value: 'ask' }]);
  const fallback = sim.describe({ id: 'p2', protocol: 'inconnu', type: 'x', ip: { src: '1.1.1.1', dst: '2.2.2.2', ttl: 3 } });
  assert.ok(fallback.some((row) => row.field === 'TTL' && row.value === '3'));
});

test('ctx.drop publie une perte avec sa raison', async () => {
  const dropper = {
    ...ECHO,
    start(ctx) { ctx.drop('a', { id: ctx.nextPacketId(), protocol: 'echo', type: 'ask' }, 'TTL nul'); },
  };
  const { sim } = await setup({ protocol: dropper });
  const events = [];
  sim.on(TOPICS.NETWORK, (event) => events.push(event));
  sim.step();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'drop');
  assert.equal(events[0].reason, 'TTL nul');
  assert.equal(sim.getState().status, STATUS.FINISHED);
});

test('ctx.schedule et l\'option delay de send décalent dans le temps simulé', async () => {
  const later = {
    ...ECHO,
    start(ctx) {
      ctx.schedule(500, () => ctx.explain('answer'));
      ctx.send('a', { id: 'p1', protocol: 'echo', type: 'answer' }, { delay: 300 });
    },
  };
  const { sim, record } = await setup({ protocol: later });
  while (sim.step());
  assert.deepEqual(record.network, ['300 send a>b answer', '400 receive a>b answer']);
  assert.deepEqual(record.steps, ['answer']);
  assert.equal(sim.getState().time, 500);
});

test('une erreur de protocole met en pause avec un message, sans planter l\'application', async (t) => {
  t.mock.method(console, 'error', () => {});
  const broken = { ...ECHO, start(ctx) { ctx.explain('etape-inexistante'); } };
  const { sim } = await setup({ protocol: broken });
  assert.equal(sim.step(), true);
  const state = sim.getState();
  assert.equal(state.status, STATUS.PAUSED);
  assert.match(state.error, /etape-inexistante/);
  assert.equal(sim.reset(), true);
  assert.equal(sim.getState().error, null);
});

test('un comportement d\'équipement peut traiter un paquet avant le protocole (hook S3)', async () => {
  const seen = [];
  const devices = { host: { onReceive(device, packet) { seen.push(`${device.id}:${packet.type}`); return packet.type === 'ask'; } } };
  const { sim, record } = await setup({ devices });
  while (sim.step());
  assert.deepEqual(seen, ['b:ask']);
  assert.deepEqual(record.network, FULL_RUN.slice(0, 2), 'b n\'a pas répondu : le switch/hôte a consommé le paquet');
});

test('le protocole est chargé dynamiquement à partir du champ "protocol"', async () => {
  const requested = [];
  const sim = createSimulation({
    scheduler: manualScheduler(),
    loadProtocol: async (name) => { requested.push(name); return ECHO; },
  });
  await sim.load(SCENARIO);
  assert.deepEqual(requested, ['echo']);
});

// --- S2 : états × commandes, historique, paquets en vol, temporisations ---

import { isAllowed, nextStatus } from '../src/sim/state.js';

/** Amène une simulation neuve dans l'état demandé. */
async function reach(status) {
  const scheduler = manualScheduler();
  const sim = createSimulation({ protocol: ECHO, scheduler });
  if (status === STATUS.IDLE) return { sim, scheduler };
  await sim.load(SCENARIO);
  if (status === STATUS.PLAYING) sim.play();
  if (status === STATUS.PAUSED) sim.step();
  if (status === STATUS.FINISHED) while (sim.step());
  assert.equal(sim.getState().status, status);
  return { sim, scheduler };
}

const CALLS = {
  play: (sim) => sim.play(),
  pause: (sim) => sim.pause(),
  step: (sim) => sim.step(),
  setSpeed: (sim) => sim.setSpeed(2),
  reset: (sim) => sim.reset(),
  load: (sim) => sim.load(SCENARIO),
};

test('chaque commande, dans chaque état, suit exactement la table des états', async () => {
  for (const status of Object.values(STATUS)) {
    for (const [command, call] of Object.entries(CALLS)) {
      const { sim } = await reach(status);
      const result = await call(sim);
      const allowed = isAllowed(command, status);
      assert.equal(result, allowed, `${command} depuis ${status} : renvoie ${result}`);
      const after = sim.getState().status;
      if (!allowed) {
        assert.equal(after, status, `${command} refusé depuis ${status} ne doit rien changer`);
      } else if (command === 'step') {
        assert.ok([STATUS.PAUSED, STATUS.FINISHED].includes(after), `step depuis ${status} → ${after}`);
      } else {
        assert.equal(after, nextStatus(status, command), `${command} depuis ${status}`);
      }
    }
  }
});

test('getHistory garde les évènements de l\'exécution courante, et repart à vide après reset', async () => {
  const { sim } = await setup();
  assert.deepEqual(sim.getHistory(), []);
  while (sim.step());
  const history = sim.getHistory();
  assert.deepEqual(history.map((e) => `${e.time} ${e.type}`), ['0 send', '100 receive', '100 send', '200 receive']);
  assert.ok(Object.isFrozen(history));
  assert.deepEqual(history.map((e) => e.id), [1, 2, 3, 4]);
  sim.reset();
  assert.deepEqual(sim.getHistory(), []);
});

test('getPacketsInFlight donne les paquets sur les liens et leur avancement', async () => {
  const { sim, scheduler } = await setup();
  assert.deepEqual(sim.getPacketsInFlight(), []);
  sim.play();
  scheduler.frame(25); // t = 25 : la question est à 25 % du lien (latence 100)
  let flying = sim.getPacketsInFlight();
  assert.equal(flying.length, 1);
  assert.equal(flying[0].event.packet.type, 'ask');
  assert.equal(flying[0].event.link, 'ab');
  assert.equal(flying[0].progress, 0.25);

  scheduler.frame(100); // t = 125 : question arrivée, réponse partie à 100, donc à 25 %
  flying = sim.getPacketsInFlight();
  assert.deepEqual(flying.map((f) => [f.event.packet.type, f.progress]), [['answer', 0.25]]);

  scheduler.frame(200); // tout est arrivé
  assert.deepEqual(sim.getPacketsInFlight(), []);
  sim.reset();
  assert.deepEqual(sim.getPacketsInFlight(), []);
});

test('ctx.schedule renvoie une annulation : une temporisation annulée n\'est jamais jouée', async () => {
  const timer = {
    ...ECHO,
    start(ctx) {
      const cancel = ctx.schedule(1000, () => ctx.explain('answer'));
      ctx.schedule(10, () => { assert.equal(cancel(), true); });
      ctx.explain('ask');
    },
  };
  const { sim, record } = await setup({ protocol: timer });
  while (sim.step());
  assert.deepEqual(record.steps, ['ask']);
  assert.equal(sim.getState().time, 10);
  assert.equal(sim.getState().status, STATUS.FINISHED);
});

test('changer de vitesse pendant la lecture ne change pas la séquence', async () => {
  const { sim, scheduler, record } = await setup();
  sim.play();
  scheduler.frame(30);
  sim.setSpeed(4);
  scheduler.frame(10);
  sim.setSpeed(0.25);
  scheduler.frame(100);
  sim.setSpeed(4);
  while (sim.getState().status === STATUS.PLAYING) scheduler.frame(16);
  assert.deepEqual(record.network, FULL_RUN);
});
