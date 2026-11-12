// Tests du switch (src/sim/devices/switch.js) : apprentissage, inondation, transmission, filtrage.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import switchBehaviour, { macTable } from '../src/sim/devices/switch.js';
import { fakeCtx, frame, LAN } from './fakeCtx.js';

const sw = LAN.devices.find((d) => d.id === 'sw1');
const PC1 = '02:00:00:00:00:01';
const PC2 = '02:00:00:00:00:02';

test('diffusion : apprise, puis recopiée sur les autres ports reliés seulement', () => {
  const { ctx, sent, explained } = fakeCtx(LAN);
  const handled = switchBehaviour.onReceive(sw, frame({ eth: { src: PC1, dst: 'ff:ff:ff:ff:ff:ff' } }), ctx, { interface: 'p1' });
  assert.equal(handled, true, 'le protocole n\'est jamais appelé pour un switch');
  assert.deepEqual(sent.map((s) => s.interface), ['p2', 'p3'], 'ni le port d\'arrivée, ni p4 non relié');
  assert.deepEqual([...macTable(ctx, 'sw1')], [[PC1, 'p1']]);
  assert.deepEqual(explained, ['switch-learn', 'switch-flood']);
  assert.equal(sent[0].packet.id, 'f1', 'la trame est recopiée telle quelle');
});

test('MAC inconnue : inondation ; MAC connue : un seul port ; même port : filtrage', () => {
  const { ctx, sent, explained } = fakeCtx(LAN);
  switchBehaviour.onReceive(sw, frame({ eth: { src: PC1, dst: PC2 } }), ctx, { interface: 'p1' });
  assert.deepEqual(sent.map((s) => s.interface), ['p2', 'p3'], 'PC 2 pas encore appris');
  sent.length = 0;
  switchBehaviour.onReceive(sw, frame({ eth: { src: PC2, dst: PC1 } }), ctx, { interface: 'p2' });
  assert.deepEqual(sent.map((s) => s.interface), ['p1'], 'PC 1 appris sur p1');
  assert.ok(explained.includes('switch-forward-sw1'), 'étape propre à cet équipement préférée');
  sent.length = 0;
  switchBehaviour.onReceive(sw, frame({ eth: { src: '02:00:00:00:00:99', dst: PC1 } }), ctx, { interface: 'p1' });
  assert.deepEqual(sent, [], 'destinataire derrière le port d\'arrivée : rien à transmettre');
});

test('un équipement qui change de port est réappris ; les explications ne sont données qu\'une fois', () => {
  const { ctx, explained } = fakeCtx(LAN);
  switchBehaviour.onReceive(sw, frame({ eth: { src: PC1, dst: 'ff:ff:ff:ff:ff:ff' } }), ctx, { interface: 'p1' });
  switchBehaviour.onReceive(sw, frame({ eth: { src: PC1, dst: 'ff:ff:ff:ff:ff:ff' } }), ctx, { interface: 'p3' });
  assert.equal(macTable(ctx, 'sw1').get(PC1), 'p3');
  assert.deepEqual(explained, ['switch-learn', 'switch-flood']);
});

test('trame sans en-tête Ethernet : ignorée', () => {
  const { ctx, sent } = fakeCtx(LAN);
  assert.equal(switchBehaviour.onReceive(sw, frame({}), ctx, { interface: 'p1' }), true);
  assert.deepEqual(sent, []);
});
