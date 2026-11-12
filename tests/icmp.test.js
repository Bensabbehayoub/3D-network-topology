// Tests du ping (src/sim/protocols/icmp.js) avec le vrai moteur et les vrais équipements.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateScenario } from '../simulation.js';
import icmp from '../src/sim/protocols/icmp.js';
import { play, readScenario, variant } from './netRun.js';

const ofType = (run, type) => run.events.filter((e) => e.type === 'send' && e.packet.type === type);

test('scenarios/ping.json : ARP des deux côtés du routeur, puis deux échanges d\'écho', async () => {
  const scenario = await readScenario('ping');
  assert.deepEqual(validateScenario(scenario).errors, []);
  const run = await play(scenario);
  assert.deepEqual(run.steps, scenario.steps.map((step) => step.id), 'chaque étape du scénario est expliquée, dans l\'ordre');
  assert.equal(run.drops.length, 0);

  // Première requête : ARP de PC 1 pour sa passerelle, ARP du routeur pour PC 2.
  const arpRequests = ofType(run, 'request').filter((e) => e.packet.protocol === 'arp');
  assert.deepEqual([...new Set(arpRequests.map((e) => e.packet.data.targetIp))], ['192.168.1.1', '192.168.2.20']);
  // Deuxième requête : aucune nouvelle diffusion ARP après la première réponse.
  const firstReply = ofType(run, 'echo-reply')[0].time;
  assert.ok(run.events.filter((e) => e.packet.protocol === 'arp' && e.time > firstReply).length === 0, 'caches ARP réutilisés');

  // TTL : 64 au départ, 63 après le routeur ; MAC Ethernet changée à chaque segment, IP inchangées.
  const request = ofType(run, 'echo-request').filter((e) => e.packet.data.sequence === 1);
  assert.deepEqual(request.map((e) => `${e.source}:${e.packet.ip.ttl}`), ['pc1:64', 'sw1:64', 'r1:63', 'sw2:63']);
  assert.deepEqual(request.map((e) => e.packet.eth.dst), ['02:00:00:00:00:a0', '02:00:00:00:00:a0', '02:00:00:00:02:20', '02:00:00:00:02:20']);
  assert.ok(request.every((e) => e.packet.ip.src === '192.168.1.10' && e.packet.ip.dst === '192.168.2.20'));
  assert.equal(new Set(request.map((e) => e.packet.id)).size, 1, 'même paquet de bout en bout');

  // Temps aller-retour : 4,8 s avec les ARP, 3,2 s ensuite (8 trajets de 400 ms).
  const replies = ofType(run, 'echo-reply').filter((e) => e.destination === 'pc1');
  const sent = ofType(run, 'echo-request').filter((e) => e.source === 'pc1');
  assert.deepEqual(replies.map((e, i) => e.arrival - sent[i].time), [4800, 3200]);
});

test('scenarios/ttl.json : TTL 1 → le premier routeur détruit le paquet et prévient PC 1', async () => {
  const scenario = await readScenario('ttl');
  assert.deepEqual(validateScenario(scenario).errors, []);
  const run = await play(scenario);
  assert.deepEqual(run.steps, scenario.steps.map((step) => step.id));
  assert.equal(run.drops.length, 1);
  assert.equal(run.drops[0].source, 'r1');
  assert.equal(run.drops[0].reason, 'TTL expiré');
  const error = ofType(run, 'time-exceeded');
  assert.deepEqual(error.map((e) => `${e.source}→${e.destination}`), ['r1→sw1', 'sw1→pc1']);
  assert.equal(error[0].packet.ip.src, '192.168.1.1', 'envoyé depuis l\'interface d\'arrivée');
  assert.deepEqual(error[0].packet.data.original, { id: run.drops[0].packet.id, protocol: 'icmp', type: 'echo-request', src: '192.168.1.10', dst: '192.168.3.10' });
  assert.ok(!run.events.some((e) => e.destination === 'srv1' && e.packet.protocol === 'icmp'), 'le serveur ne reçoit rien');
});

test('cible inexistante dans le réseau local : ARP sans réponse, requêtes perdues, délai écoulé', async () => {
  const scenario = variant(await readScenario('ping'), (s) => { s.params = { source: 'pc1', targetIp: '192.168.1.77', count: 1, timeout: 5000 }; });
  const run = await play(scenario);
  assert.equal(ofType(run, 'echo-request').length, 0, 'aucune requête d\'écho ne part sans adresse MAC');
  assert.equal(run.drops.length, 1);
  assert.match(run.drops[0].reason, /ARP sans réponse/);
  assert.equal(run.state.time, 5000);
});

test('hôte sans passerelle vers un autre réseau : perte immédiate « aucune route »', async () => {
  const scenario = variant(await readScenario('ping'), (s) => {
    delete s.devices.find((d) => d.id === 'pc1').gateway;
    s.params.count = 1;
  });
  const run = await play(scenario);
  assert.equal(run.drops.length, 1);
  assert.equal(run.drops[0].source, 'pc1');
  assert.equal(run.drops[0].reason, 'aucune route vers 192.168.2.20');
  assert.equal(run.events.filter((e) => e.type === 'send').length, 0);
  assert.ok(run.steps.includes('icmp-summary'), 'le bilan est quand même donné');
});

test('describe : type ICMP, séquence et paquet d\'origine', () => {
  const echo = icmp.describe({ id: 'p1', protocol: 'icmp', type: 'echo-request', eth: null, ip: { src: '1.1.1.1', dst: '2.2.2.2', ttl: 64 }, data: { identifier: 1, sequence: 2 } });
  assert.equal(echo.find((f) => f.layer === 'ICMP' && f.field === 'Type').value, 'requête d\'écho (type 8)');
  assert.equal(echo.find((f) => f.field === 'Séquence').value, '2');
  const error = icmp.describe({ id: 'p2', protocol: 'icmp', type: 'time-exceeded', eth: null, ip: { src: '1.1.1.1', dst: '2.2.2.2', ttl: 64 }, data: { original: { protocol: 'icmp', src: '2.2.2.2', dst: '3.3.3.3' } } });
  assert.equal(error.find((f) => f.field === 'Paquet d\'origine').value, 'ICMP 2.2.2.2 → 3.3.3.3');
});
