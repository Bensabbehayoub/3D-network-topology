// Tests du routage statique (src/sim/devices/router.js, src/sim/net.js) : scenarios/routage.json.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateScenario } from '../simulation.js';
import { play, readScenario, variant } from './netRun.js';

test('scenarios/routage.json : deux routeurs, routes statiques dans les deux sens, TTL 64 → 62', async () => {
  const scenario = await readScenario('routage');
  assert.deepEqual(validateScenario(scenario).errors, []);
  const run = await play(scenario);
  assert.deepEqual(run.steps, scenario.steps.map((step) => step.id));
  assert.equal(run.drops.length, 0);
  const echo = (type) => run.events.filter((e) => e.type === 'send' && e.packet.type === type).map((e) => `${e.source}:${e.packet.ip.ttl}`);
  assert.deepEqual(echo('echo-request'), ['pc1:64', 'sw1:64', 'r1:63', 'r2:62', 'sw2:62']);
  assert.deepEqual(echo('echo-reply'), ['srv1:64', 'sw2:64', 'r2:63', 'r1:62', 'sw1:62']);
  // ARP sur la liaison entre routeurs : 10.0.0.2 demandé par le Routeur 1.
  assert.ok(run.events.some((e) => e.packet.protocol === 'arp' && e.source === 'r1' && e.packet.data.targetIp === '10.0.0.2'));
});

test('sans la route retour sur le Routeur 2 : la requête arrive, la réponse est perdue sur le Routeur 2', async () => {
  const scenario = variant(await readScenario('routage'), (s) => {
    delete s.devices.find((d) => d.id === 'r2').routes;
  });
  const run = await play(scenario);
  // La requête arrive au serveur, mais le Routeur 2 ne sait pas où renvoyer la réponse.
  assert.ok(run.events.some((e) => e.type === 'receive' && e.destination === 'srv1' && e.packet.type === 'echo-request'));
  assert.deepEqual(run.drops.map((d) => `${d.source}: ${d.reason}`), ['r2: aucune route vers 192.168.1.10']);
  // La réponse perdue venait du serveur : c'est lui que le Routeur 2 prévient.
  const unreachable = run.events.filter((e) => e.type === 'send' && e.packet.type === 'unreachable');
  assert.deepEqual(unreachable.map((e) => `${e.source}→${e.destination}`), ['r2→sw2', 'sw2→srv1']);
  assert.ok(!run.events.some((e) => e.type === 'receive' && e.destination === 'pc1' && e.packet.protocol === 'icmp'), 'PC 1 ne reçoit rien');
});

test('sans route aller sur le Routeur 1 : perte et « destination inaccessible » renvoyé à PC 1', async () => {
  const scenario = variant(await readScenario('routage'), (s) => {
    delete s.devices.find((d) => d.id === 'r1').routes;
    s.params.timeout = 6000;
  });
  const run = await play(scenario);
  assert.deepEqual(run.drops.map((d) => `${d.source}: ${d.reason}`), ['r1: aucune route vers 192.168.3.10']);
  const unreachable = run.events.filter((e) => e.type === 'send' && e.packet.type === 'unreachable');
  assert.deepEqual(unreachable.map((e) => `${e.source}→${e.destination}`), ['r1→sw1', 'sw1→pc1']);
});

test('route par défaut d\'un routeur : utilisée quand aucune route plus précise ne convient', async () => {
  const scenario = variant(await readScenario('routage'), (s) => {
    s.devices.find((d) => d.id === 'r1').routes = [{ network: '0.0.0.0/0', via: '10.0.0.2' }];
  });
  const run = await play(scenario);
  assert.equal(run.drops.length, 0);
  assert.ok(run.events.some((e) => e.type === 'receive' && e.destination === 'pc1' && e.packet.type === 'echo-reply'));
});
