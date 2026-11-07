// Tests du contrat d'évènements et du bus Observer.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BROADCAST_MAC, createBus, createEvent, EVENT_TYPES, isBroadcast, TOPICS } from '../src/sim/events.js';

const packet = { id: 'p1', protocol: 'arp', type: 'request', eth: { src: '02:00:00:00:00:01', dst: BROADCAST_MAC } };

test('createEvent remplit les champs absents par null et gèle l\'évènement', () => {
  const event = createEvent({ id: 1, time: 0, type: EVENT_TYPES.RECEIVE, source: 'pc1', destination: 'sw1', link: 'l1', packet });
  assert.equal(event.sourceInterface, null);
  assert.equal(event.arrival, null);
  assert.equal(event.step, null);
  assert.equal(event.reason, null);
  assert.ok(Object.isFrozen(event));
});

test('un envoi doit annoncer son instant d\'arrivée', () => {
  assert.throws(() => createEvent({ id: 1, time: 100, type: 'send', packet }), /arrival/);
  assert.throws(() => createEvent({ id: 1, time: 100, type: 'send', arrival: 50, packet }), /arrival/);
  assert.equal(createEvent({ id: 1, time: 100, type: 'send', arrival: 500, packet }).arrival, 500);
});

test('une perte porte une raison', () => {
  assert.equal(createEvent({ id: 2, time: 0, type: 'drop', packet }).reason, 'inconnue');
  assert.equal(createEvent({ id: 2, time: 0, type: 'drop', packet, reason: 'TTL nul' }).reason, 'TTL nul');
});

test('createEvent refuse un type, un instant ou un paquet invalides', () => {
  assert.throws(() => createEvent({ id: 1, time: 0, type: 'teleport', packet }), /type inconnu/);
  assert.throws(() => createEvent({ id: 1, time: -1, type: 'receive', packet }), /time/);
  assert.throws(() => createEvent({ id: 1, time: 0, type: 'receive', packet: { id: 'p1' } }), /protocol/);
  assert.throws(() => createEvent({ id: 1.5, time: 0, type: 'receive', packet }), /id/);
});

test('isBroadcast reconnaît la MAC de diffusion, quelle que soit la casse', () => {
  assert.equal(isBroadcast(packet), true);
  assert.equal(isBroadcast({ ...packet, eth: { src: 'a', dst: 'FF:FF:FF:FF:FF:FF' } }), true);
  assert.equal(isBroadcast({ ...packet, eth: { src: 'a', dst: '02:00:00:00:00:02' } }), false);
  assert.equal(isBroadcast({ ...packet, eth: null }), false);
});

test('le bus prévient les abonnés dans l\'ordre et permet de se désabonner', () => {
  const bus = createBus();
  const log = [];
  const off = bus.on(TOPICS.TICK, ({ time }) => log.push(`a${time}`));
  bus.on(TOPICS.TICK, ({ time }) => log.push(`b${time}`));
  bus.emit(TOPICS.TICK, { time: 1 });
  off();
  bus.emit(TOPICS.TICK, { time: 2 });
  assert.deepEqual(log, ['a1', 'b1', 'b2']);
});

test('once ne reçoit qu\'un seul message', () => {
  const bus = createBus();
  let count = 0;
  bus.once(TOPICS.RESET, () => count++);
  bus.emit(TOPICS.RESET, { time: 0 });
  bus.emit(TOPICS.RESET, { time: 0 });
  assert.equal(count, 1);
  assert.equal(bus.count(TOPICS.RESET), 0);
});

test('un abonné en erreur n\'empêche pas les autres d\'être prévenus', (t) => {
  t.mock.method(console, 'error', () => {});
  const bus = createBus();
  let reached = false;
  bus.on(TOPICS.STATE, () => { throw new Error('panne'); });
  bus.on(TOPICS.STATE, () => { reached = true; });
  bus.emit(TOPICS.STATE, {});
  assert.equal(reached, true);
  assert.equal(console.error.mock.callCount(), 1);
});

test('un sujet inconnu est refusé (faute de frappe détectée tout de suite)', () => {
  const bus = createBus();
  assert.throws(() => bus.on('netwrok', () => {}), /sujet inconnu/);
  assert.throws(() => bus.emit('netwrok', {}), /sujet inconnu/);
});
