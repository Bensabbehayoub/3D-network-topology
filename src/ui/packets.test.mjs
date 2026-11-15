// Tests des paquets côté interface (phase 4d) : lignes du journal, vue de l'inspecteur, sélection.
// Avec le vrai moteur et les vrais protocoles, sans DOM.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createSimulation } from '../../simulation.js';
import { DEVICE_BEHAVIOURS } from '../sim/devices/index.js';
import { createPacketSelection, deviceName, findEvent, logEntry, packetLabel, packetView } from './packets.js';

async function arpRun() {
  const scenario = JSON.parse(await readFile(new URL('../../scenarios/arp.json', import.meta.url), 'utf8'));
  const sim = createSimulation({ devices: DEVICE_BEHAVIOURS, scheduler: { start: () => () => {} } });
  await sim.load(scenario);
  return { sim, scenario };
}

test('libellés : protocole et type en français, messages DHCP gardés', () => {
  assert.equal(packetLabel({ protocol: 'arp', type: 'request' }), 'ARP requête');
  assert.equal(packetLabel({ protocol: 'icmp', type: 'echo-reply' }), 'ICMP réponse d\'écho');
  assert.equal(packetLabel({ protocol: 'dhcp', type: 'request' }), 'DHCP REQUEST');
  assert.equal(packetLabel({ protocol: 'tcp', type: 'syn-ack' }), 'TCP SYN-ACK');
  assert.equal(packetLabel({ protocol: 'x', type: 'inconnu' }), 'X inconnu');
  assert.equal(deviceName({ devices: [{ id: 'pc1', label: 'PC 1' }] }, 'pc1'), 'PC 1');
  assert.equal(deviceName(null, 'r9'), 'r9');
});

test('journal : envois et pertes seulement, avec instant, trajet et diffusion', async () => {
  const { sim, scenario } = await arpRun();
  sim.step(); // t = 0 : requête ARP envoyée
  const [sent] = sim.getHistory();
  assert.deepEqual(logEntry(sent, scenario), {
    eventId: sent.id, kind: 'send', time: '0,0 s', label: 'ARP requête', route: 'PC 1 → Switch',
    protocol: 'arp', broadcast: true, reason: null,
  });
  sim.step();
  const received = sim.getHistory().find((event) => event.type === 'receive');
  assert.equal(logEntry(received, scenario), null, 'les réceptions ne sont pas listées');
  const drop = { id: 99, time: 2400, type: 'drop', source: 'sw1', packet: { protocol: 'icmp', type: 'echo-request' }, reason: 'TTL expiré' };
  assert.equal(logEntry(drop, scenario).route, 'perdu sur Switch');
  assert.equal(logEntry(drop, scenario).reason, 'TTL expiré');
});

test('inspecteur : trajet, étape et champs groupés par couche, fournis par le protocole', async () => {
  const { sim } = await arpRun();
  sim.step();
  const sent = sim.getHistory()[0];
  const view = packetView({ sim }, sent.id);
  assert.equal(view.title, 'ARP requête');
  assert.deepEqual(view.meta.map((row) => row.label), ['Instant', 'De', 'Vers', 'Câble', 'Étape']);
  assert.equal(view.meta.find((row) => row.label === 'De').value, 'PC 1 (eth0)');
  assert.equal(view.meta.find((row) => row.label === 'Étape').value, 'Requête ARP en diffusion');
  assert.deepEqual(view.layers.map((group) => group.layer), ['Paquet', 'Ethernet', 'ARP']);
  assert.equal(view.layers.at(-1).fields.find((f) => f.field === 'IP cible').value, '192.168.1.20');
  assert.equal(packetView({ sim }, 12345), null);
  assert.equal(findEvent({}, 1), null);
});

test('sélection : id d\'évènement connu seulement, mise en avant dans la scène, effacée à la réinitialisation', async () => {
  const { sim } = await arpRun();
  sim.step();
  const highlighted = [];
  const changes = [];
  const packets = createPacketSelection({ sim, render: { highlightPacket: (id) => highlighted.push(id) } });
  packets.onChange((id) => changes.push(id));
  const id = sim.getHistory()[0].id;
  assert.equal(packets.select(999), false);
  assert.equal(packets.select('1'), false);
  assert.equal(packets.select(id), true);
  assert.equal(packets.get(), id);
  sim.reset();
  assert.equal(packets.get(), null);
  assert.deepEqual(changes, [id, null]);
  assert.deepEqual(highlighted, [id, null]);
  packets.dispose();
});
