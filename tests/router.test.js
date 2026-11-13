// Tests du routeur (src/sim/devices/router.js) avec un faux ctx : ARP, TTL, routes, erreurs ICMP.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import router from '../src/sim/devices/router.js';
import { arpCache } from '../src/sim/stack.js';
import { fakeCtx, frame, LAN } from './fakeCtx.js';

const r1 = LAN.devices.find((d) => d.id === 'r1');
const PC1 = '02:00:00:00:00:01';
const G0 = '02:00:00:00:00:a0';

const fromPc1 = (ip, extra = {}) => frame({ eth: { src: PC1, dst: G0 }, ip: { src: '192.168.1.10', ttl: 64, ...ip }, ...extra });

test('ARP : répond pour l\'adresse de l\'interface qui reçoit la question', () => {
  const { ctx, sent } = fakeCtx(LAN);
  const ask = (targetIp) => frame({ protocol: 'arp', type: 'request', eth: { src: PC1, dst: 'ff:ff:ff:ff:ff:ff' },
    data: { operation: 'request', senderMac: PC1, senderIp: '192.168.1.10', targetMac: '00:00:00:00:00:00', targetIp } });
  router.onReceive(r1, ask('192.168.1.1'), ctx, { interface: 'g0' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].interface, 'g0');
  assert.equal(sent[0].packet.data.senderMac, G0);
  router.onReceive(r1, ask('192.168.2.1'), ctx, { interface: 'g0' });
  assert.equal(sent.length, 1, 'pas de réponse pour l\'adresse d\'une autre interface (pas de proxy ARP)');
});

test('fait suivre : TTL − 1, nouvel en-tête Ethernet, sortie par l\'interface du réseau visé', () => {
  const { ctx, sent } = fakeCtx(LAN);
  arpCache(ctx, 'r1').set('192.168.2.20', '02:00:00:00:02:20');
  router.onReceive(r1, fromPc1({ dst: '192.168.2.20' }), ctx, { interface: 'g0' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].interface, 'g1');
  assert.deepEqual(sent[0].packet.eth, { src: '02:00:00:00:00:a1', dst: '02:00:00:00:02:20' });
  assert.deepEqual(sent[0].packet.ip, { src: '192.168.1.10', dst: '192.168.2.20', ttl: 63 });
  assert.equal(sent[0].packet.id, 'f1', 'même paquet, suivi de bout en bout');
});

test('saut suivant inconnu : requête ARP sur l\'interface de sortie, le paquet attend', () => {
  const { ctx, sent, scheduled } = fakeCtx(LAN);
  router.onReceive(r1, fromPc1({ dst: '192.168.2.20' }), ctx, { interface: 'g0' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].packet.protocol, 'arp');
  assert.equal(sent[0].interface, 'g1');
  assert.equal(sent[0].packet.data.targetIp, '192.168.2.20');
  assert.equal(scheduled.length, 1, 'délai ARP armé');
  // La réponse arrive : le paquet en attente part, et le délai est annulé.
  router.onReceive(r1, frame({ protocol: 'arp', type: 'reply', eth: { src: '02:00:00:00:02:20', dst: '02:00:00:00:00:a1' },
    data: { operation: 'reply', senderMac: '02:00:00:00:02:20', senderIp: '192.168.2.20', targetMac: '02:00:00:00:00:a1', targetIp: '192.168.2.1' } }), ctx, { interface: 'g1' });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].packet.ip.ttl, 63);
  assert.equal(scheduled[0].cancelled, true);
});

test('TTL à 1 : paquet détruit et « TTL expiré » renvoyé depuis l\'interface d\'arrivée', () => {
  const { ctx, sent, dropped } = fakeCtx(LAN);
  arpCache(ctx, 'r1').set('192.168.1.10', PC1);
  router.onReceive(r1, fromPc1({ dst: '192.168.2.20', ttl: 1 }), ctx, { interface: 'g0' });
  assert.deepEqual(dropped.map((d) => d.reason), ['TTL expiré']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].packet.type, 'time-exceeded');
  assert.deepEqual([sent[0].packet.ip.src, sent[0].packet.ip.dst], ['192.168.1.1', '192.168.1.10']);
});

test('aucune route : perte et « destination inaccessible » ; jamais d\'erreur en réponse à une erreur', () => {
  const { ctx, sent, dropped } = fakeCtx(LAN);
  arpCache(ctx, 'r1').set('192.168.1.10', PC1);
  router.onReceive(r1, fromPc1({ dst: '8.8.8.8' }), ctx, { interface: 'g0' });
  assert.deepEqual(dropped.map((d) => d.reason), ['aucune route vers 8.8.8.8']);
  assert.equal(sent[0].packet.type, 'unreachable');
  router.onReceive(r1, fromPc1({ dst: '8.8.8.8' }, { type: 'unreachable' }), ctx, { interface: 'g0' });
  assert.equal(sent.length, 1, 'pas d\'erreur ICMP pour une erreur ICMP');
});

test('ping vers le routeur lui-même : il répond ; autres paquets pour lui : laissés au protocole', () => {
  const { ctx, sent } = fakeCtx(LAN);
  arpCache(ctx, 'r1').set('192.168.1.10', PC1);
  assert.equal(router.onReceive(r1, fromPc1({ dst: '192.168.2.1' }), ctx, { interface: 'g0' }), true);
  assert.equal(sent[0].packet.type, 'echo-reply');
  assert.equal(sent[0].packet.ip.src, '192.168.2.1');
  assert.equal(router.onReceive(r1, fromPc1({ dst: '192.168.1.1' }, { protocol: 'udp', type: 'datagram' }), ctx, { interface: 'g0' }), false);
});

test('trame pour une autre MAC ou sans IP : ignorée', () => {
  const { ctx, sent, dropped } = fakeCtx(LAN);
  router.onReceive(r1, frame({ eth: { src: PC1, dst: '02:00:00:00:00:02' }, ip: { src: '192.168.1.10', dst: '192.168.2.20', ttl: 64 } }), ctx, { interface: 'g0' });
  router.onReceive(r1, frame({ eth: { src: PC1, dst: G0 } }), ctx, { interface: 'g0' });
  assert.deepEqual([sent, dropped], [[], []]);
});
