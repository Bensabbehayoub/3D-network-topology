// Tests de TCP (src/sim/protocols/tcp.js, RST de l'hôte) avec le vrai moteur.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateScenario } from '../simulation.js';
import tcp from '../src/sim/protocols/tcp.js';
import { transmissionTime } from '../src/sim/traffic.js';
import { play, readScenario, variant } from './netRun.js';

/** Segments TCP émis par les deux bouts (sans les recopies du switch), au format « source TYPE seq/ack/len ». */
const segments = (run, kinds = ['send', 'drop']) => run.events
  .filter((e) => kinds.includes(e.type) && e.packet.transport?.protocol === 'tcp' && e.source !== 'sw1')
  .map((e) => `${e.type === 'drop' ? 'PERDU ' : ''}${e.source} ${e.packet.transport.flags.join('+')} ${e.packet.transport.seq}/${e.packet.transport.ack}/${e.packet.data.length}`);

test('scenarios/tcp.json : poignée de main, perte, ACK dupliqué, retransmission, fermeture, RST', async () => {
  const scenario = await readScenario('tcp');
  assert.deepEqual(validateScenario(scenario).errors, []);
  const run = await play(scenario);
  assert.deepEqual(run.steps, scenario.steps.map((step) => step.id));
  assert.deepEqual(segments(run), [
    'pc1 SYN 1000/0/0',
    'srv1 SYN+ACK 5000/1001/0',
    'pc1 ACK 1001/5001/0',
    'pc1 ACK 1001/5001/1000',
    'pc1 ACK 2001/5001/1000', // part normalement…
    'pc1 PSH+ACK 3001/5001/1000',
    'PERDU pc1 ACK 2001/5001/1000', // … et disparaît à mi-câble (perte simulée)
    'srv1 ACK 5001/2001/0', // reçu jusqu'à 2000
    'srv1 ACK 5001/2001/0', // 3001 arrivé avant 2001 : ACK dupliqué
    'pc1 ACK 2001/5001/1000', // retransmission du seul segment manquant
    'srv1 ACK 5001/4001/0', // acquittement cumulatif
    'pc1 FIN+ACK 4001/5001/0',
    'srv1 FIN+ACK 5001/4002/0',
    'pc1 ACK 4002/5002/0',
    'pc1 SYN 11000/0/0', // deuxième connexion : nouveau port, nouveau numéro initial
    'PERDU srv1 SYN 11000/0/0', // port 9001 fermé : SYN rejeté par le serveur…
    'srv1 RST+ACK 0/11001/0', // … qui répond RST
  ]);
  const ports = run.events.filter((e) => e.type === 'send' && e.source === 'pc1' && e.packet.type === 'syn').map((e) => e.packet.transport);
  assert.deepEqual(ports.map((t) => [t.src, t.dst]), [[49152, 9000], [49153, 9001]]);
  // La retransmission attend le RTO (4 s) après le dernier acquittement qui a fait avancer.
  const retransmit = run.events.findLast((e) => e.type === 'send' && e.source === 'pc1' && e.packet.transport?.seq === 2001 && e.packet.data.length > 0);
  const lastProgress = run.events.find((e) => e.type === 'send' && e.source === 'srv1' && e.packet.transport?.ack === 2001);
  // L'ACK atteint le switch à lastProgress.arrival, repart (émission d'une trame de 64 octets à
  // 1 Gb/s) et arrive à PC 1 400 ms plus tard : la temporisation repart de là.
  const ackAtPc1 = lastProgress.arrival + transmissionTime(64, 1000) + 400;
  assert.ok(Math.abs(retransmit.time - ackAtPc1 - 4000) < 1e-6, String(retransmit.time - ackAtPc1));
});

test('sans perte : trois segments acquittés dans l\'ordre, aucune retransmission', async () => {
  const scenario = variant(await readScenario('tcp'), (s) => { delete s.params.loseSegment; delete s.params.closedPort; });
  const run = await play(scenario);
  assert.equal(run.drops.length, 0);
  const acks = run.events.filter((e) => e.type === 'send' && e.source === 'srv1' && e.packet.type === 'ack').map((e) => e.packet.transport.ack);
  assert.deepEqual(acks, [2001, 3001, 4001]);
  assert.ok(!run.steps.includes('tcp-retransmit'));
});

test('serveur muet : SYN renvoyé, puis abandon', async () => {
  const scenario = variant(await readScenario('tcp'), (s) => {
    s.params.serverIp = '192.168.1.99';
    delete s.params.closedPort;
    s.params.rto = 2000;
    s.steps.push({ id: 'tcp-failed', title: 'Échec', text: 'Pas de réponse.' });
  });
  const run = await play(scenario);
  // Aucune MAC pour 192.168.1.99 : les SYN restent en attente ARP puis sont perdus.
  assert.ok(run.steps.includes('tcp-failed'));
});

test('describe : séquence, acquittement, fenêtre, données', () => {
  const fields = tcp.describe({ id: 'p1', protocol: 'tcp', type: 'data', eth: null, ip: { src: '1.1.1.1', dst: '2.2.2.2', ttl: 64 },
    transport: { protocol: 'tcp', src: 49152, dst: 9000, flags: ['ACK'], seq: 1001, ack: 5001, window: 8000 },
    data: { length: 1000, part: 1, parts: 3, message: { name: 'rapport.txt', size: 3000 } } });
  const value = (field) => fields.find((f) => f.field === field).value;
  assert.equal(value('Numéro de séquence'), '1001');
  assert.equal(value('Numéro d\'acquittement'), '5001');
  assert.equal(value('Segment'), '1 sur 3');
  assert.equal(value('Fichier'), 'rapport.txt (3000 octets)');
  const syn = tcp.describe({ id: 'p2', protocol: 'tcp', type: 'syn', eth: null, ip: null, transport: { protocol: 'tcp', src: 1, dst: 2, flags: ['SYN'], seq: 1000, ack: 0 }, data: { length: 0 } });
  assert.equal(syn.find((f) => f.field === 'Numéro d\'acquittement').value, '—', 'sans ACK, le champ n\'a pas de sens');
});
