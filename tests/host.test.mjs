// Tests de l'hôte et du serveur (src/sim/devices/host.js) avec un faux ctx.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEVICE_BEHAVIOURS } from '../src/sim/devices/index.js';
import host from '../src/sim/devices/host.js';
import { arpCache } from '../src/sim/stack.js';
import { fakeCtx, frame, LAN } from './fakeCtx.js';

const pc2 = LAN.devices.find((d) => d.id === 'pc2');
const PC1 = '02:00:00:00:00:01';
const PC2 = '02:00:00:00:00:02';

test('un serveur se comporte comme un hôte', () => {
  assert.equal(DEVICE_BEHAVIOURS.server, host);
  assert.equal(DEVICE_BEHAVIOURS.host, host);
});

test('trame pour une autre MAC : ignorée par la carte réseau, sans perte affichée', () => {
  const { ctx, sent, dropped } = fakeCtx(LAN);
  const packet = frame({ eth: { src: PC1, dst: '02:00:00:00:00:03' }, ip: { src: '192.168.1.10', dst: '192.168.1.30', ttl: 64 } });
  assert.equal(host.onReceive(pc2, packet, ctx, { interface: 'eth0' }), true);
  assert.deepEqual([sent, dropped], [[], []]);
});

test('requête ARP pour son adresse : réponse unicast et le demandeur est retenu', () => {
  const { ctx, sent } = fakeCtx(LAN);
  const request = frame({ protocol: 'arp', type: 'request', eth: { src: PC1, dst: 'ff:ff:ff:ff:ff:ff' },
    data: { operation: 'request', senderMac: PC1, senderIp: '192.168.1.10', targetMac: '00:00:00:00:00:00', targetIp: '192.168.1.20' } });
  assert.equal(host.onReceive(pc2, request, ctx, { interface: 'eth0' }), true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].packet.eth, { src: PC2, dst: PC1 });
  assert.equal(sent[0].packet.data.operation, 'reply');
  assert.equal(arpCache(ctx, 'pc2').get('192.168.1.10'), PC1);
});

test('requête ARP pour une autre adresse : pas de réponse, rien appris', () => {
  const { ctx, sent } = fakeCtx(LAN);
  const request = frame({ protocol: 'arp', type: 'request', eth: { src: PC1, dst: 'ff:ff:ff:ff:ff:ff' },
    data: { operation: 'request', senderMac: PC1, senderIp: '192.168.1.10', targetMac: '00:00:00:00:00:00', targetIp: '192.168.1.30' } });
  host.onReceive(pc2, request, ctx, { interface: 'eth0' });
  assert.deepEqual(sent, []);
  assert.equal(arpCache(ctx, 'pc2').size, 0);
});

test('paquet IP pour une autre adresse arrivé sur sa MAC : perte (un hôte ne route pas)', () => {
  const { ctx, dropped } = fakeCtx(LAN);
  const packet = frame({ eth: { src: PC1, dst: PC2 }, ip: { src: '192.168.1.10', dst: '10.9.9.9', ttl: 64 } });
  assert.equal(host.onReceive(pc2, packet, ctx, { interface: 'eth0' }), true);
  assert.equal(dropped.length, 1);
  assert.match(dropped[0].reason, /ne fait pas suivre/);
  assert.equal(dropped[0].step, 'host-not-for-me');
});

test('ping reçu : réponse d\'écho par la pile ; réponse d\'écho reçue : laissée au protocole', () => {
  const { ctx, sent } = fakeCtx(LAN);
  arpCache(ctx, 'pc2').set('192.168.1.10', PC1);
  const request = frame({ eth: { src: PC1, dst: PC2 }, ip: { src: '192.168.1.10', dst: '192.168.1.20', ttl: 64 }, data: { identifier: 1, sequence: 3 } });
  assert.equal(host.onReceive(pc2, request, ctx, { interface: 'eth0' }), true);
  assert.equal(sent.length, 1, 'MAC en cache : réponse immédiate');
  assert.equal(sent[0].packet.type, 'echo-reply');
  assert.deepEqual(sent[0].packet.ip, { src: '192.168.1.20', dst: '192.168.1.10', ttl: 64 });
  assert.deepEqual(sent[0].packet.data, { identifier: 1, sequence: 3 });
  const reply = frame({ type: 'echo-reply', eth: { src: PC1, dst: PC2 }, ip: { src: '192.168.1.10', dst: '192.168.1.20', ttl: 64 } });
  assert.equal(host.onReceive(pc2, reply, ctx, { interface: 'eth0' }), false);
});

test('TCP vers un port fermé : perte et RST (jamais en réponse à un RST)', () => {
  const { ctx, sent, dropped } = fakeCtx(LAN);
  arpCache(ctx, 'pc2').set('192.168.1.10', PC1);
  const syn = frame({ protocol: 'tcp', type: 'syn', eth: { src: PC1, dst: PC2 }, ip: { src: '192.168.1.10', dst: '192.168.1.20', ttl: 64 },
    transport: { protocol: 'tcp', src: 49152, dst: 22, flags: ['SYN'], seq: 1000, ack: 0 }, data: { length: 0 } });
  assert.equal(host.onReceive(pc2, syn, ctx, { interface: 'eth0' }), true);
  assert.deepEqual(dropped.map((d) => d.reason), ['port TCP 22 fermé']);
  assert.deepEqual(sent[0].packet.transport, { protocol: 'tcp', src: 22, dst: 49152, flags: ['RST', 'ACK'], seq: 0, ack: 1001, window: 0 });
  host.onReceive(pc2, { ...syn, transport: { ...syn.transport, flags: ['RST'] } }, ctx, { interface: 'eth0' });
  assert.equal(sent.length, 1);
});
