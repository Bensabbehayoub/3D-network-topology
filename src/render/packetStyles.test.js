import assert from 'node:assert/strict';
import { test } from 'node:test';

import packetStyles, {
  getPacketStyle,
  normalizeProtocol,
  PACKET_PROTOCOLS,
  PACKET_STYLES,
  UNKNOWN_PROTOCOL,
} from './packetStyles.js';

test('les neuf categories ont des couleurs stables, valides et distinctes', () => {
  assert.equal(PACKET_PROTOCOLS.length, 9);
  const colors = PACKET_PROTOCOLS.map((protocol) => getPacketStyle(protocol).color);
  assert.equal(new Set(colors).size, PACKET_PROTOCOLS.length);
  for (const color of colors) assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff);
  assert.equal(getPacketStyle('icmp').color, 0x38d9ff);
  assert.equal(getPacketStyle('arp').color, 0xffd166);
});

test('chaque protocole fournit un unicast compact et un broadcast renforce', () => {
  for (const protocol of PACKET_PROTOCOLS) {
    const unicast = getPacketStyle(protocol, false);
    const broadcast = getPacketStyle(protocol, true);
    assert.equal(unicast.protocol, protocol);
    assert.equal(broadcast.color, unicast.color);
    assert.equal(unicast.broadcast, false);
    assert.equal(unicast.halo, false);
    assert.equal(broadcast.broadcast, true);
    assert.equal(broadcast.halo, true);
    assert.ok(broadcast.radius > unicast.radius);
    assert.ok(broadcast.emissiveIntensity > unicast.emissiveIntensity);
  }
});

test('la diffusion est derivee de la destination Ethernet du contrat partage', () => {
  const broadcast = { protocol: 'arp', eth: { src: '02:00:00:00:00:01', dst: 'FF:FF:FF:FF:FF:FF' } };
  const unicast = { protocol: 'arp', eth: { src: '02:00:00:00:00:01', dst: '02:00:00:00:00:02' } };
  assert.strictEqual(getPacketStyle(broadcast), PACKET_STYLES.arp.broadcast);
  assert.strictEqual(getPacketStyle(unicast), PACKET_STYLES.arp.unicast);
});

test('un protocole inconnu utilise un fallback sur et previsible', () => {
  assert.equal(normalizeProtocol('smtp'), UNKNOWN_PROTOCOL);
  assert.strictEqual(getPacketStyle('smtp'), PACKET_STYLES.unknown.unicast);
  assert.strictEqual(getPacketStyle(null), PACKET_STYLES.unknown.unicast);
});

test('les alias de routage pointent vers la categorie routing', () => {
  for (const alias of ['routing', 'routage', 'static-routing', 'routage-statique']) {
    assert.strictEqual(getPacketStyle(alias), PACKET_STYLES.routing.unicast);
  }
});

test('les descripteurs et les tables sont immuables', () => {
  assert.ok(Object.isFrozen(PACKET_PROTOCOLS));
  assert.ok(Object.isFrozen(PACKET_STYLES));
  assert.ok(Object.isFrozen(PACKET_STYLES.icmp));
  assert.ok(Object.isFrozen(PACKET_STYLES.icmp.broadcast));
  assert.throws(() => { PACKET_STYLES.icmp.broadcast.radius = 99; }, TypeError);
});

test('les recherches coherentes reutilisent exactement le meme objet', () => {
  assert.strictEqual(getPacketStyle(' DNS '), getPacketStyle('dns', false));
  assert.strictEqual(getPacketStyle('dns', true), getPacketStyle('dns', true));
  assert.strictEqual(packetStyles.get('tcp'), PACKET_STYLES.tcp.unicast);
});

test('le module est pur et ne depend d aucune API navigateur', () => {
  assert.doesNotThrow(() => getPacketStyle({ protocol: 'icmp', eth: null }));
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.window, 'undefined');
});
