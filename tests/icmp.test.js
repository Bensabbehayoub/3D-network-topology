import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSimulation } from '../src/sim/commands.js';
import { checkProtocol } from '../src/sim/protocol.js';
import icmp, { createEchoReply, createEchoRequest, DEFAULT_TTL, ICMP_TYPES } from '../src/sim/protocols/icmp.js';

const SCENARIO = {
  schema: 1, id: 'icmp-direct', title: 'Ping direct de test', protocol: 'icmp',
  params: { source: 'pc1', target: 'pc2', identifier: 42, sequence: 7, payload: 'bonjour' },
  devices: [
    { id: 'pc1', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:00:01', ip: '10.0.0.1/24' }] },
    { id: 'pc2', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:00:02', ip: '10.0.0.2/24' }] },
  ],
  links: [{ id: 'direct', a: 'pc1:eth0', b: 'pc2:eth0', latency: 25 }],
  steps: [
    { id: 'icmp-request', title: 'Demande', text: 'PC 1 envoie une demande.' },
    { id: 'icmp-reply', title: 'Reponse', text: 'PC 2 repond.' },
  ],
};

const REQUEST = () => createEchoRequest({
  id: 'p1', source: '10.0.0.1', destination: '10.0.0.2', identifier: 12,
  sequence: 3, payload: { text: 'test' }, ttl: 32,
});

function mockContext(overrides = {}) {
  let packetId = 1;
  const calls = { send: [], drop: [], explain: [] };
  const devices = new Map(SCENARIO.devices.map((device) => [device.id, device]));
  const ctx = {
    scenario: SCENARIO, params: SCENARIO.params,
    device(id) { const device = devices.get(id); if (!device) throw new Error(`absent: ${id}`); return device; },
    nextPacketId: () => `p${packetId++}`,
    send: (...args) => calls.send.push(args), drop: (...args) => calls.drop.push(args),
    explain: (step) => calls.explain.push(step), ...overrides,
  };
  return { ctx, calls };
}

async function runDirectPing(params = {}) {
  const sim = createSimulation({ protocol: icmp });
  await sim.load(SCENARIO, params);
  while (sim.step());
  return sim;
}

test('construit une Echo Request conforme sans identifiant aleatoire', () => {
  const packet = REQUEST();
  assert.deepEqual(packet, {
    id: 'p1', protocol: 'icmp', type: ICMP_TYPES.ECHO_REQUEST, eth: null,
    ip: { src: '10.0.0.1', dst: '10.0.0.2', ttl: 32 }, transport: null,
    data: { identifier: 12, sequence: 3, payload: { text: 'test' } },
  });
  assert.equal(createEchoRequest({ id: 'x', source: '10.0.0.1', destination: '10.0.0.2' }).ip.ttl, DEFAULT_TTL);
});

test('Echo Reply inverse les adresses et conserve identifiant, sequence et payload', () => {
  const request = REQUEST();
  request.eth = { src: '02:00:00:00:00:01', dst: '02:00:00:00:00:02' };
  const reply = createEchoReply(request, 'p2');
  assert.equal(reply.type, ICMP_TYPES.ECHO_REPLY);
  assert.deepEqual(reply.ip, { src: '10.0.0.2', dst: '10.0.0.1', ttl: DEFAULT_TTL });
  assert.deepEqual(reply.eth, { src: request.eth.dst, dst: request.eth.src });
  assert.deepEqual(reply.data, request.data);
  assert.notEqual(reply.data.payload, request.data.payload);
});

test('start utilise les equipements, nextPacketId et le contexte', () => {
  const { ctx, calls } = mockContext();
  const packet = icmp.start(ctx);
  assert.equal(packet.id, 'p1');
  assert.deepEqual(packet.ip, { src: '10.0.0.1', dst: '10.0.0.2', ttl: DEFAULT_TTL });
  assert.deepEqual(packet.data, { identifier: 42, sequence: 7, payload: 'bonjour' });
  assert.deepEqual(calls.send, [['pc1', packet, { interface: 'eth0', step: 'icmp-request' }]]);
  assert.deepEqual(calls.explain, ['icmp-request']);
});

test('la destination genere une seule reponse avec un nouvel id', () => {
  const { ctx, calls } = mockContext();
  assert.equal(icmp.onReceive(SCENARIO.devices[1], REQUEST(), ctx), true);
  assert.equal(calls.send.length, 1);
  const [, reply, options] = calls.send[0];
  assert.equal(reply.id, 'p1');
  assert.equal(reply.type, ICMP_TYPES.ECHO_REPLY);
  assert.deepEqual(reply.data, REQUEST().data);
  assert.deepEqual(options, { interface: 'eth0', step: 'icmp-reply' });
});

test('ne repond jamais a une Echo Reply', () => {
  const { ctx, calls } = mockContext();
  const reply = createEchoReply(REQUEST(), 'p2');
  assert.equal(icmp.onReceive(SCENARIO.devices[0], reply, ctx), true);
  assert.deepEqual(calls.send, []);
});

test('ignore les autres protocoles et les paquets destines ailleurs', () => {
  const { ctx, calls } = mockContext();
  assert.equal(icmp.onReceive(SCENARIO.devices[0], { id: 'a1', protocol: 'arp', type: 'request' }, ctx), false);
  assert.equal(icmp.onReceive(SCENARIO.devices[0], REQUEST(), ctx), false);
  assert.deepEqual(calls, { send: [], drop: [], explain: [] });
});

test('rejette les entrees invalides et signale les messages mal formes', () => {
  assert.throws(() => createEchoRequest({ id: '', source: '10.0.0.1', destination: 'x' }), /id/);
  assert.throws(() => createEchoRequest({ id: 'p', source: '10.0.0.1', destination: 'x' }), /IPv4/);
  assert.throws(() => createEchoRequest({ id: 'p', source: '10.0.0.1', destination: '10.0.0.2', sequence: -1 }), /sequence/);
  assert.throws(() => createEchoReply({ ...REQUEST(), type: ICMP_TYPES.ECHO_REPLY }, 'p2'), /echo-request/);
  const { ctx, calls } = mockContext();
  const malformed = { ...REQUEST(), data: { sequence: 1 } };
  assert.equal(icmp.onReceive(SCENARIO.devices[1], malformed, ctx), false);
  assert.equal(calls.drop.length, 1);
  assert.match(calls.drop[0][2], /identifier/);
});

test('un type ICMP non pris en charge est abandonne', () => {
  const { ctx, calls } = mockContext();
  assert.equal(icmp.onReceive(SCENARIO.devices[1], { ...REQUEST(), type: 'time-exceeded' }, ctx), false);
  assert.equal(calls.send.length, 0);
  assert.match(calls.drop[0][2], /non pris en charge/);
});

test('un TTL expire produit une perte et aucune reponse', () => {
  const { ctx, calls } = mockContext();
  const expired = REQUEST(); expired.ip.ttl = 0;
  assert.equal(icmp.onReceive(SCENARIO.devices[1], expired, ctx), true);
  assert.equal(calls.send.length, 0);
  assert.equal(calls.drop[0][2], 'TTL expire');
});

test('plusieurs requetes sequentielles donnent des reponses distinctes', () => {
  const { ctx, calls } = mockContext();
  const second = REQUEST(); second.id = 'p99'; second.data.sequence = 4;
  icmp.onReceive(SCENARIO.devices[1], REQUEST(), ctx);
  icmp.onReceive(SCENARIO.devices[1], second, ctx);
  assert.deepEqual(calls.send.map((call) => [call[1].id, call[1].data.sequence]), [['p1', 3], ['p2', 4]]);
});

test('integration moteur : demande puis reponse dans l ordre simule', async () => {
  const sim = await runDirectPing();
  assert.deepEqual(sim.getHistory().map((event) => [event.time, event.type, event.source, event.destination, event.packet.type]), [
    [0, 'send', 'pc1', 'pc2', ICMP_TYPES.ECHO_REQUEST],
    [25, 'receive', 'pc1', 'pc2', ICMP_TYPES.ECHO_REQUEST],
    [25, 'send', 'pc2', 'pc1', ICMP_TYPES.ECHO_REPLY],
    [50, 'receive', 'pc2', 'pc1', ICMP_TYPES.ECHO_REPLY],
  ]);
  assert.deepEqual(sim.getHistory().filter((event) => event.type === 'send').map((event) => event.packet.id), ['p1', 'p2']);
});

test('reset reproduit exactement la meme execution deterministe', async () => {
  const sim = await runDirectPing();
  const projection = () => sim.getHistory().map((event) => [event.time, event.type, event.packet.id, event.packet.type]);
  const first = projection();
  sim.reset(); while (sim.step());
  assert.deepEqual(projection(), first);
});

test('start echoue clairement si la destination ou une adresse manque', () => {
  assert.throws(() => icmp.start(mockContext({ params: { source: 'pc1' } }).ctx), /source.*target/);
  const noAddress = { id: 'pc2', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:00:02' }] };
  const { ctx } = mockContext({ device: (id) => (id === 'pc1' ? SCENARIO.devices[0] : noAddress) });
  assert.throws(() => icmp.start(ctx), /adresse IPv4/);
});

test('describe fournit les en-tetes et une explication pedagogique', () => {
  const fields = icmp.describe(REQUEST());
  assert.ok(fields.some((field) => field.field === 'IP source' && field.value === '10.0.0.1'));
  assert.ok(fields.some((field) => field.field === 'Message' && /type 8/.test(field.value)));
  assert.ok(fields.some((field) => field.field === 'Identifiant' && field.value === '12'));
  assert.ok(fields.some((field) => field.field === 'Sequence' && field.value === '3'));
  assert.ok(fields.some((field) => field.field === 'Explication' && /destinataire/.test(field.value)));
  assert.doesNotThrow(() => icmp.describe({ protocol: 'icmp', type: 'inconnu' }));
});

test('respecte exactement l interface publique des protocoles', () => {
  assert.deepEqual(checkProtocol(icmp), []);
  assert.equal(icmp.name, 'icmp');
  for (const method of ['start', 'onReceive', 'describe']) assert.equal(typeof icmp[method], 'function');
});
