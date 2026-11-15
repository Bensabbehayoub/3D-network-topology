// Tests du protocole ARP (src/sim/protocols/arp.js, pile src/sim/stack.js) avec le vrai moteur.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateScenario } from '../simulation.js';
import arp from '../src/sim/protocols/arp.js';
import { transmissionTime } from '../src/sim/traffic.js';
import { play, readScenario, variant } from './netRun.js';

test('scenarios/arp.json : requête diffusée, inondation, réponse directe, cache', async () => {
  const scenario = await readScenario('arp');
  assert.deepEqual(validateScenario(scenario).errors, []);
  const run = await play(scenario);
  assert.deepEqual(run.sends, [
    'arp/request pc1→sw1',
    'arp/request sw1→pc2', // le switch inonde la diffusion sur ses autres ports
    'arp/request sw1→pc3',
    'arp/reply pc2→sw1',
    'arp/reply sw1→pc1', // MAC de PC 1 apprise : la réponse ne part que vers p1
  ]);
  assert.deepEqual(run.steps, ['arp-cache-miss', 'arp-request', 'arp-flood', 'arp-reply', 'arp-ignore', 'arp-cache-update']);
  assert.equal(run.drops.length, 0);
  // 4 trajets de 400 ms + 4 trames de 64 octets émises à 1 Gb/s (0,672 ms chacune, temps ralenti).
  assert.equal(run.state.time, 1600 + 4 * transmissionTime(64, 1000));

  const request = run.events.find((e) => e.type === 'send' && e.packet.type === 'request').packet;
  assert.deepEqual(request.eth, { src: '02:00:00:00:00:01', dst: 'ff:ff:ff:ff:ff:ff' });
  assert.equal(request.ip, null, 'ARP est sous IP : pas d\'en-tête IP');
  assert.deepEqual(request.data, { operation: 'request', senderMac: '02:00:00:00:00:01', senderIp: '192.168.1.10', targetMac: '00:00:00:00:00:00', targetIp: '192.168.1.20' });
  const reply = run.events.find((e) => e.type === 'send' && e.packet.type === 'reply').packet;
  assert.deepEqual(reply.eth, { src: '02:00:00:00:00:02', dst: '02:00:00:00:00:01' }, 'réponse en unicast');
  assert.equal(reply.data.senderIp, '192.168.1.20');
});

test('cible absente : la requête reste sans réponse, abandon après le délai ARP', async () => {
  const scenario = variant(await readScenario('arp'), (s) => { s.params = { source: 'pc1', targetIp: '192.168.1.99' }; });
  const run = await play(scenario);
  assert.deepEqual(run.sends, ['arp/request pc1→sw1', 'arp/request sw1→pc2', 'arp/request sw1→pc3']);
  assert.equal(run.state.time, 3000, 'ARP_TIMEOUT');
  assert.ok(!run.steps.includes('arp-reply'));
});

test('describe : opération et adresses ARP pour l\'inspecteur', () => {
  const fields = arp.describe({ id: 'p1', protocol: 'arp', type: 'request', eth: { src: 'a', dst: 'ff:ff:ff:ff:ff:ff' }, ip: null, data: { operation: 'request', senderMac: 'a', senderIp: '192.168.1.10', targetMac: '00:00:00:00:00:00', targetIp: '192.168.1.20' } });
  assert.match(fields.find((f) => f.field === 'Opération').value, /^requête/);
  assert.equal(fields.find((f) => f.field === 'IP cible').value, '192.168.1.20');
  assert.ok(fields.every((f) => typeof f.value === 'string'));
});
