// Tests de l'interface protocole : chaque fichier de src/sim/protocols/ doit la respecter.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';

import { checkProtocol, describeHeaders, loadProtocol } from '../src/sim/protocol.js';

test('checkProtocol liste ce qui manque', () => {
  assert.deepEqual(checkProtocol({ name: 'x', start() {}, onReceive() {}, describe() {} }), []);
  const errors = checkProtocol({ name: 'X' });
  assert.equal(errors.length, 4);
  assert.deepEqual(checkProtocol(null), ['le protocole doit être un objet (export default)']);
});

test('chaque protocole du dépôt respecte l\'interface et porte le nom de son fichier', async () => {
  const files = (await readdir(new URL('../src/sim/protocols/', import.meta.url))).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const name = file.replace(/\.js$/, '');
    const protocol = await loadProtocol(name);
    assert.equal(protocol.name, name);
  }
});

test('loadProtocol refuse un nom qui sortirait du dossier des protocoles', async () => {
  await assert.rejects(loadProtocol('../engine'), /invalide/);
  await assert.rejects(loadProtocol('ARP'), /invalide/);
});

test('describeHeaders affiche les couches présentes, et seulement elles', () => {
  const arp = describeHeaders({ id: 'p1', protocol: 'arp', type: 'request', eth: { src: 'a', dst: 'b' }, ip: null });
  assert.deepEqual(arp.map((row) => row.layer), ['Paquet', 'Paquet', 'Ethernet', 'Ethernet']);

  const tcp = describeHeaders({
    id: 'p2', protocol: 'tcp', type: 'syn',
    eth: { src: 'a', dst: 'b' }, ip: { src: '1.1.1.1', dst: '2.2.2.2', ttl: 64 },
    transport: { src: 49152, dst: 80, flags: ['SYN'] },
  });
  assert.deepEqual(tcp.find((row) => row.field === 'Indicateurs'), { layer: 'Transport', field: 'Indicateurs', value: 'SYN' });
  assert.ok(tcp.every((row) => typeof row.value === 'string'), 'les valeurs sont des chaînes prêtes à afficher');
});
