// Tests de la palette des paquets (src/render/packetStyles.js).
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';

import { BROADCAST_RADIUS, colorNumber, DEFAULT_COLOR, packetStyle, PROTOCOL_COLORS, PROTOCOL_LABELS, UNICAST_RADIUS } from './packetStyles.js';

test('chaque protocole du moteur a sa couleur, toutes différentes', async () => {
  const protocols = (await readdir(new URL('../sim/protocols/', import.meta.url))).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));
  for (const name of protocols) {
    assert.ok(PROTOCOL_COLORS[name], `couleur manquante pour ${name}`);
    assert.ok(PROTOCOL_LABELS[name], `libellé manquant pour ${name}`);
  }
  const colors = Object.values(PROTOCOL_COLORS);
  assert.equal(new Set(colors).size, colors.length);
  assert.ok(!colors.includes(DEFAULT_COLOR));
});

test('diffusion plus grosse, même couleur ; protocole inconnu en gris', () => {
  assert.deepEqual(packetStyle('arp'), { color: PROTOCOL_COLORS.arp, radius: UNICAST_RADIUS });
  assert.deepEqual(packetStyle('ARP', true), { color: PROTOCOL_COLORS.arp, radius: BROADCAST_RADIUS });
  assert.equal(packetStyle('demo').color, DEFAULT_COLOR);
  assert.equal(packetStyle(undefined).color, DEFAULT_COLOR);
  assert.equal(colorNumber('#ffd166'), 0xffd166);
});
