// Tests de DHCP (src/sim/protocols/dhcp.js, configuration à l'exécution de la pile).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateScenario } from '../simulation.js';
import dhcp, { chooseAddress, prefixOfMask } from '../src/sim/protocols/dhcp.js';
import { play, readScenario, variant } from './netRun.js';

const dhcpSends = (run) => run.events.filter((e) => e.type === 'send' && e.packet.protocol === 'dhcp' && e.source !== 'sw1');

test('scenarios/dhcp.json : DORA pour deux clients, adresses distinctes, ping de vérification', async () => {
  const scenario = await readScenario('dhcp');
  assert.deepEqual(validateScenario(scenario).errors, []);
  const run = await play(scenario);
  assert.deepEqual(run.steps, scenario.steps.map((step) => step.id));
  assert.deepEqual(dhcpSends(run).map((e) => `${e.source} ${e.packet.type}`), [
    'pc1 discover', 'srv1 offer', 'pc1 request', 'srv1 ack',
    'pc2 discover', 'srv1 offer', 'pc2 request', 'srv1 ack',
  ]);
  const [discover, offer, request, ack] = dhcpSends(run).map((e) => e.packet);
  assert.deepEqual(discover.ip, { src: '0.0.0.0', dst: '255.255.255.255', ttl: 64 });
  assert.equal(discover.eth.dst, 'ff:ff:ff:ff:ff:ff');
  assert.deepEqual(discover.transport, { protocol: 'udp', src: 68, dst: 67 });
  assert.equal(offer.data.yiaddr, '192.168.1.100');
  assert.deepEqual(offer.data.options, { messageType: 'OFFER', serverId: '192.168.1.2', subnetMask: '255.255.255.0', router: '192.168.1.1', dns: null, leaseTime: 86400 });
  assert.equal(request.data.options.requestedIp, '192.168.1.100');
  assert.equal(ack.data.xid, discover.data.xid);
  assert.equal(dhcpSends(run)[5].packet.data.yiaddr, '192.168.1.101', 'PC 2 reçoit l\'adresse suivante');
  // Vérification : chaque client pingue la passerelle avec sa nouvelle adresse.
  const pings = run.events.filter((e) => e.type === 'send' && e.packet.type === 'echo-request' && e.source !== 'sw1');
  assert.deepEqual(pings.map((e) => e.packet.ip.src), ['192.168.1.100', '192.168.1.101']);
  assert.equal(run.drops.length, 0);
  // Le routeur reçoit les diffusions DHCP mais ne les fait jamais suivre.
  assert.ok(!run.events.some((e) => e.type === 'send' && e.source === 'r1' && e.packet.protocol === 'dhcp'));
});

test('sans DHCP, PC 1 n\'a pas d\'adresse : il ne peut pas pinguer', async () => {
  const scenario = variant(await readScenario('ping'), (s) => {
    const pc1 = s.devices.find((d) => d.id === 'pc1');
    delete pc1.interfaces[0].ip;
    s.params.count = 1;
  });
  const run = await play(scenario);
  assert.equal(run.drops.length, 1);
  assert.match(run.drops[0].reason, /aucune route/);
});

test('plage épuisée : le client suivant ne reçoit pas d\'offre', async () => {
  const scenario = variant(await readScenario('dhcp'), (s) => {
    s.devices.find((d) => d.id === 'srv1').dhcp.end = '192.168.1.100';
    s.params.verify = false;
    s.steps.push({ id: 'dhcp-pool-empty', title: 'Plus d\'adresse', text: 'La plage est épuisée.' });
  });
  const run = await play(scenario);
  assert.deepEqual(run.drops.map((d) => d.reason), ['plage d\'adresses DHCP épuisée']);
  assert.ok(run.steps.includes('dhcp-pool-empty'));
  assert.equal(dhcpSends(run).filter((e) => e.packet.type === 'ack').length, 1);
});

test('choix d\'adresse : bail existant, offre en cours, adresses fixes évitées', () => {
  const config = { start: '192.168.1.100', end: '192.168.1.102' };
  const empty = { leases: new Map(), offers: new Map() };
  assert.equal(chooseAddress(config, empty, new Set(['192.168.1.100']), 'a'), '192.168.1.101');
  assert.equal(chooseAddress(config, { leases: new Map([['a', '192.168.1.102']]), offers: new Map() }, new Set(), 'a'), '192.168.1.102');
  assert.equal(chooseAddress(config, { leases: new Map([['b', '192.168.1.100']]), offers: new Map([['c', '192.168.1.101']]) }, new Set(['192.168.1.102']), 'a'), null);
  assert.equal(prefixOfMask('255.255.255.0'), 24);
  assert.equal(prefixOfMask('255.255.255.252'), 30);
  assert.equal(prefixOfMask('0.0.0.0'), 0);
});

test('describe : message, transaction, adresses proposées et options', () => {
  const fields = dhcp.describe({ id: 'p2', protocol: 'dhcp', type: 'offer', eth: null, ip: { src: '192.168.1.2', dst: '255.255.255.255', ttl: 64 },
    transport: { protocol: 'udp', src: 67, dst: 68 },
    data: { xid: 0x3c00, chaddr: '02:00:00:00:01:11', yiaddr: '192.168.1.100', options: { messageType: 'OFFER', serverId: '192.168.1.2', subnetMask: '255.255.255.0', router: '192.168.1.1', leaseTime: 86400 } } });
  assert.equal(fields.find((f) => f.field === 'Message').value, 'OFFER');
  assert.equal(fields.find((f) => f.field === 'Adresse proposée').value, '192.168.1.100');
  assert.equal(fields.find((f) => f.field === 'Durée du bail').value, '86400 s');
});
