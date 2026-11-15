// Tests de la mesure du trafic (src/sim/traffic.js) et de la file d'attente des ports (commands.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSimulation, TOPICS } from '../simulation.js';
import {
  createTrafficMeter, frameSize, linkBandwidth, payloadSize, throughput, transmissionModel, transmissionTime, WINDOW,
} from '../src/sim/traffic.js';
import { play, readScenario } from './netRun.js';

test('taille des trames : en-têtes réels, 64 octets au minimum', () => {
  assert.equal(frameSize({ protocol: 'arp', eth: {} }), 64, 'ARP : 28 octets, complété à 64');
  assert.equal(frameSize({ protocol: 'icmp', type: 'echo-request', eth: {}, ip: {}, data: { sequence: 1 } }), 78, '18 + 20 IP + 8 ICMP + 32');
  assert.equal(frameSize({ protocol: 'tcp', eth: {}, ip: {}, transport: { protocol: 'tcp' }, data: { length: 1000 } }), 1058, '18 + 20 + 20 + 1000');
  assert.equal(frameSize({ protocol: 'tcp', eth: {}, ip: {}, transport: { protocol: 'tcp' }, data: { length: 0 } }), 64, 'ACK seul : 58 → 64');
  assert.equal(payloadSize({ protocol: 'dhcp', ip: {}, transport: { protocol: 'udp' } }), 328);
  assert.equal(payloadSize({ protocol: 'dns', ip: {}, transport: { protocol: 'udp' }, data: { question: { name: 'www.ecole.test' }, answers: [{}] } }), 20 + 8 + 12 + 16 + 4 + 16);
});

test('temps d\'émission et débit : échelle 1 s de simulation = 1 ms de réseau', () => {
  assert.ok(Math.abs(transmissionTime(1500, 1000) - 12.16) < 1e-9, '1520 octets × 8 / 1 Gb/s = 12,16 µs → 12,16 ms ici');
  assert.ok(Math.abs(transmissionTime(1500, 100) - 121.6) < 1e-9, 'dix fois plus lent à 100 Mb/s');
  assert.equal(throughput(1250, 10), 1000, '1250 octets en 10 µs de réseau = 1 Gb/s');
  assert.equal(throughput(100, 0), 0);
});

test('bande passante effective : la plus petite du lien, des deux ports et du câble', () => {
  const scenario = {
    devices: [
      { id: 'a', model: 'sw-24g', interfaces: [{ name: 'p1' }, { name: 'p25' }] },
      { id: 'b', interfaces: [{ name: 'eth0', speed: 100 }] },
      { id: 'c', interfaces: [{ name: 'eth0' }] },
    ],
  };
  assert.equal(linkBandwidth(scenario, { a: 'a:p1', b: 'c:eth0' }), 1000);
  assert.equal(linkBandwidth(scenario, { a: 'a:p1', b: 'b:eth0' }), 100, 'port à 100 Mb/s');
  assert.equal(linkBandwidth(scenario, { a: 'a:p1', b: 'c:eth0', cable: 'cuivre-cat5' }), 100, 'câble catégorie 5');
  assert.equal(linkBandwidth(scenario, { a: 'a:p1', b: 'c:eth0', bandwidth: 100 }), 100);
});

test('file d\'attente : un port émet une trame à la fois, dans l\'ordre', async () => {
  const scenario = {
    schema: 1, id: 'f', title: 'f', protocol: 'x',
    devices: [{ id: 'a', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:00:01', speed: 100 }] },
      { id: 'b', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:00:02' }] }],
    links: [{ id: 'l1', a: 'a:eth0', b: 'b:eth0' }],
    steps: [{ id: 's', title: 's', text: 's' }],
  };
  const protocol = {
    name: 'x',
    start(ctx) {
      for (let i = 1; i <= 3; i += 1) ctx.send('a', { id: `p${i}`, protocol: 'tcp', type: 'data', eth: { src: 'x', dst: 'y' }, ip: {}, transport: { protocol: 'tcp' }, data: { length: 1000 } });
    },
    onReceive() {},
    describe: () => [],
  };
  const sim = createSimulation({ protocol, transmission: transmissionModel, scheduler: { start: () => () => {} } });
  const sends = [];
  sim.on(TOPICS.NETWORK, (event) => { if (event.type === 'send') sends.push(event); });
  await sim.load(scenario);
  while (sim.getState().status !== 'finished') sim.step();
  const duration = transmissionTime(1058, 100);
  assert.deepEqual(sends.map((e) => e.packet.id), ['p1', 'p2', 'p3']);
  sends.forEach((event, i) => {
    assert.ok(Math.abs(event.time - i * duration) < 1e-9, `trame ${i + 1} part quand la précédente a fini`);
    assert.ok(Math.abs(event.transmitted - (i + 1) * duration) < 1e-9);
    assert.equal(event.arrival, event.transmitted + 400);
    assert.equal(event.bytes, 1058);
  });
});

test('compteur : débit instantané, moyen et utilisation, par lien, port et équipement', () => {
  const scenario = {
    devices: [{ id: 'a', interfaces: [{ name: 'eth0' }] }, { id: 'b', interfaces: [{ name: 'eth0' }] }],
    links: [{ id: 'l1', a: 'a:eth0', b: 'b:eth0', bandwidth: 100 }],
  };
  const meter = createTrafficMeter();
  // Lien occupé à 100 % de t = 0 à t = WINDOW par une seule trame (temps d'émission = WINDOW).
  meter.add({ type: 'send', link: 'l1', source: 'a', sourceInterface: 'eth0', destination: 'b', destinationInterface: 'eth0', time: 0, transmitted: WINDOW, bytes: 12500 });
  meter.add({ type: 'receive', link: 'l1' });
  const snap = meter.snapshot(scenario, WINDOW);
  assert.equal(snap.links.l1.bandwidth, 100);
  assert.equal(Math.round(snap.links.l1.ab.current), 100, '12 500 octets en 1 ms de réseau = 100 Mb/s');
  assert.equal(snap.links.l1.ba.current, 0);
  assert.equal(snap.links.l1.utilization, 1);
  assert.equal(Math.round(snap.ports['a:eth0'].tx.current), 100);
  assert.equal(Math.round(snap.ports['b:eth0'].rx.current), 100);
  assert.equal(snap.devices.a.bandwidth, 200, 'duplex : 100 en émission + 100 en réception');
  assert.equal(snap.devices.a.utilization, 0.5);
  const later = meter.snapshot(scenario, 3 * WINDOW);
  assert.equal(later.links.l1.ab.current, 0, 'plus rien dans la fenêtre : débit instantané nul');
  assert.equal(Math.round(later.links.l1.ab.average), 33, 'débit moyen sur 3 ms');
  meter.reset();
  assert.equal(meter.snapshot(scenario, WINDOW).links.l1.ab.average, 0);
});

test('scenarios/debit.json : le lien à 100 Mb/s sature, les liens des PC non, aucune perte', async () => {
  const scenario = await readScenario('debit');
  const meter = createTrafficMeter();
  const run = await play(scenario, {}, (sim) => sim.on(TOPICS.NETWORK, (event) => meter.add(event)));
  assert.equal(run.drops.length, 0);
  assert.ok(run.steps.includes('tcp-summary'));
  assert.equal(linkBandwidth(scenario, scenario.links[3]), 100, 'câble de catégorie 5');
  // Au plus fort des transferts, le lien vers le serveur est presque plein.
  let peak = 0;
  let accessPeak = 0;
  for (let t = 4000; t <= 9000; t += 250) {
    const snap = meter.snapshot(scenario, t);
    peak = Math.max(peak, snap.links.l4.utilization);
    accessPeak = Math.max(accessPeak, snap.links.l1.utilization);
  }
  assert.ok(peak > 0.9, `utilisation du lien lent : ${peak}`);
  assert.ok(accessPeak < 0.2, `utilisation d'un lien d'accès : ${accessPeak}`);
  assert.ok(peak <= 1, 'jamais plus de 100 % : la file d\'attente l\'en empêche');
});
