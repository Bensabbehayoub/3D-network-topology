// Tests d'UDP (src/sim/protocols/udp.js, ports et erreurs de la pile) avec le vrai moteur.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateScenario } from '../simulation.js';
import udp from '../src/sim/protocols/udp.js';
import { play, readScenario, variant } from './netRun.js';

test('scenarios/udp.json : datagrammes livrés sans réponse, port fermé → ICMP port inaccessible', async () => {
  const scenario = await readScenario('udp');
  assert.deepEqual(validateScenario(scenario).errors, []);
  const run = await play(scenario);
  assert.deepEqual(run.steps, scenario.steps.map((step) => step.id));
  const datagrams = run.events.filter((e) => e.type === 'send' && e.source === 'pc1' && e.packet.protocol === 'udp');
  assert.deepEqual(datagrams.map((e) => e.packet.transport), [
    { protocol: 'udp', src: 49152, dst: 514 },
    { protocol: 'udp', src: 49153, dst: 514 },
    { protocol: 'udp', src: 49154, dst: 5000 },
  ], 'un port éphémère par envoi, à partir de 49152');
  // Aucun accusé de réception : le serveur n'émet rien vers le port 514 côté client.
  assert.equal(run.events.filter((e) => e.type === 'send' && e.source === 'srv1' && e.packet.protocol === 'udp').length, 0);
  assert.deepEqual(run.drops.map((d) => `${d.source}: ${d.reason}`), ['srv1: port UDP 5000 fermé']);
  const error = run.events.find((e) => e.type === 'send' && e.packet.type === 'unreachable').packet;
  assert.equal(error.data.code, 'port');
  assert.equal(error.data.original.dstPort, 5000);
  assert.deepEqual([error.ip.src, error.ip.dst], ['192.168.1.50', '192.168.1.10']);
});

test('sans service déclaré, même le port 514 est fermé', async () => {
  const scenario = variant(await readScenario('udp'), (s) => { delete s.devices.find((d) => d.id === 'srv1').services; s.params.closedPort = undefined; });
  const run = await play(scenario);
  assert.equal(run.drops.length, 2);
  assert.ok(run.drops.every((d) => d.reason === 'port UDP 514 fermé'));
});

test('describe : protocole de transport, ports et contenu', () => {
  const fields = udp.describe({ id: 'p1', protocol: 'udp', type: 'datagram', eth: null, ip: { src: '1.1.1.1', dst: '2.2.2.2', ttl: 64 },
    transport: { protocol: 'udp', src: 49152, dst: 514 }, data: { sequence: 1, message: 'mesure n°1' } });
  assert.equal(fields.find((f) => f.field === 'Protocole' && f.layer === 'Transport').value, 'UDP');
  assert.equal(fields.find((f) => f.field === 'Port destination').value, '514');
  assert.equal(fields.find((f) => f.field === 'Contenu').value, 'mesure n°1');
});
