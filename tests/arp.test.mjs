// Tests du protocole ARP (src/sim/protocols/arp.mjs, pile src/sim/stack.mjs) avec le vrai moteur.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateScenario } from '../simulation.mjs';
import arp from '../src/sim/protocols/arp.mjs';
import { transmissionTime } from '../src/sim/traffic.mjs';
import { play, readScenario, variant } from './netRun.mjs';

test('scenarios/arp.json : requête diffusée, inondation, réponse directe, cache', async () => {
  const scenario = await readScenario('arp');
  assert.deepEqual(validateScenario(scenario).errors, []);
  const run = await play(scenario);
  assert.deepEqual(run.sends, [
    'arp/request pc1→sw1',
    'arp/request sw1→pc2', // le switch inonde la diffusion sur ses autres ports
    'arp/request sw1→pc3',
    'arp/reply pc2→sw1',
    'arp/reply sw1→pc1', // MAC de PC 1 apprise : la réponse ne part que vers p1
  ]);
  assert.deepEqual(run.steps, ['arp-cache-miss', 'arp-request', 'arp-flood', 'arp-reply', 'arp-ignore', 'arp-cache-update']);
  assert.equal(run.drops.length, 0);
  // 4 trajets de 400 ms + 4 trames de 64 octets émises à 1 Gb/s (0,672 ms chacune, temps ralenti).
  assert.equal(run.state.time, 1600 + 4 * transmissionTime(64, 1000));

  const request = run.events.find((e) => e.type === 'send' && e.packet.type === 'request').packet;
  assert.deepEqual(request.eth, { src: '02:00:00:00:00:01', dst: 'ff:ff:ff:ff:ff:ff' });
  assert.equal(request.ip, null, 'ARP est sous IP : pas d\'en-tête IP');
  assert.deepEqual(request.data, { operation: 'request', senderMac: '02:00:00:00:00:01', senderIp: '192.168.1.10', targetMac: '00:00:00:00:00:00', targetIp: '192.168.1.20' });
  const reply = run.events.find((e) => e.type === 'send' && e.packet.type === 'reply').packet;
  assert.deepEqual(reply.eth, { src: '02:00:00:00:00:02', dst: '02:00:00:00:00:01' }, 'réponse en unicast');
  assert.equal(reply.data.senderIp, '192.168.1.20');
});

test('cible absente : la requête reste sans réponse, abandon après le délai ARP', async () => {
  const scenario = variant(await readScenario('arp'), (s) => { s.params = { source: 'pc1', targetIp: '192.168.1.99' }; });
  const run = await play(scenario);
  assert.deepEqual(run.sends, ['arp/request pc1→sw1', 'arp/request sw1→pc2', 'arp/request sw1→pc3']);
  assert.equal(run.state.time, 3000, 'ARP_TIMEOUT');
  assert.ok(!run.steps.includes('arp-reply'));
});

test('describe : opération et adresses ARP pour l\'inspecteur', () => {
  const fields = arp.describe({ id: 'p1', protocol: 'arp', type: 'request', eth: { src: 'a', dst: 'ff:ff:ff:ff:ff:ff' }, ip: null, data: { operation: 'request', senderMac: 'a', senderIp: '192.168.1.10', targetMac: '00:00:00:00:00:00', targetIp: '192.168.1.20' } });
  assert.match(fields.find((f) => f.field === 'Opération').value, /^requête/);
  assert.equal(fields.find((f) => f.field === 'IP cible').value, '192.168.1.20');
  assert.ok(fields.every((f) => typeof f.value === 'string'));
});

// --- S3 (Khalil) : cache consultable, passerelle, domaine de diffusion, file d'attente,
//     réponse tardive, règle de fusion de la RFC 826 ---

import { createSimulation, networkTables, TOPICS } from '../simulation.mjs';
import { DEVICE_BEHAVIOURS } from '../src/sim/devices/index.mjs';
import { ARP_TIMEOUT, handleArp } from '../src/sim/stack.mjs';
import { transmissionModel } from '../src/sim/traffic.mjs';
import { fakeCtx, LAN } from './fakeCtx.mjs';
import { noClock } from './netRun.mjs';

/** Simulation réelle pilotée pas à pas, avec les tables consultables (comme dans l'application). */
async function stepper(scenario, params = {}) {
  const sim = createSimulation({ devices: DEVICE_BEHAVIOURS, transmission: transmissionModel, tables: networkTables, scheduler: noClock });
  await sim.load(scenario, params);
  return sim;
}

/** Requêtes ARP émises par l'équipement lui-même (pas les copies inondées par les switches). */
const arpRequestsFrom = (run, device) =>
  run.events.filter((e) => e.type === 'send' && e.packet.protocol === 'arp' && e.packet.type === 'request' && e.source === device);

test('getDeviceTables : on voit le cache ARP se remplir, puis se vider à la réinitialisation', async () => {
  const sim = await stepper(await readScenario('arp'));
  assert.deepEqual(sim.getDeviceTables('pc1'), { arp: [], pendingArp: [], macTable: [] });

  sim.step(); // la requête part : PC 1 attend la réponse
  assert.deepEqual(sim.getDeviceTables('pc1').pendingArp, ['192.168.1.20']);
  assert.deepEqual(sim.getDeviceTables('pc1').arp, []);

  while (sim.getState().status !== 'finished') sim.step();
  assert.deepEqual(sim.getDeviceTables('pc1'), { arp: [{ ip: '192.168.1.20', mac: '02:00:00:00:00:02' }], pendingArp: [], macTable: [] });
  assert.deepEqual(sim.getDeviceTables('pc2').arp, [{ ip: '192.168.1.10', mac: '02:00:00:00:00:01' }],
    'la cible retient le demandeur en répondant');
  assert.deepEqual(sim.getDeviceTables('pc3').arp, [], 'PC 3 n\'était pas visé et ne connaissait pas PC 1 : rien appris');
  assert.deepEqual(sim.getDeviceTables('sw1').macTable, [
    { mac: '02:00:00:00:00:01', interface: 'p1' },
    { mac: '02:00:00:00:00:02', interface: 'p2' },
  ]);
  assert.ok(Object.isFrozen(sim.getDeviceTables('pc1').arp), 'copie en lecture seule');
  assert.equal(sim.getDeviceTables('inconnu'), null);

  sim.reset();
  assert.deepEqual(sim.getDeviceTables('pc1'), { arp: [], pendingArp: [], macTable: [] });
});

test('sans l\'option tables, getDeviceTables renvoie null (faux moteur, tests du contrôleur)', async () => {
  const sim = createSimulation({ devices: DEVICE_BEHAVIOURS, scheduler: noClock });
  await sim.load(await readScenario('arp'));
  assert.equal(sim.getDeviceTables('pc1'), null);
});

test('vers un autre réseau, PC 1 demande la MAC de sa passerelle ; le routeur résout le saut suivant', async () => {
  const run = await play(await readScenario('ping'), { count: 1 });
  const [fromPc1] = arpRequestsFrom(run, 'pc1');
  const [fromRouter] = arpRequestsFrom(run, 'r1');
  assert.equal(fromPc1.packet.data.targetIp, '192.168.1.1', 'la passerelle, pas PC 2');
  assert.equal(fromRouter.packet.data.targetIp, '192.168.2.20');
  assert.equal(fromRouter.sourceInterface, 'g1', 'requête sur l\'interface de sortie');
  assert.equal(fromRouter.packet.data.senderIp, '192.168.2.1', 'avec l\'adresse de cette interface');
});

test('la diffusion ARP reste dans son réseau : le routeur ne la fait jamais suivre', async () => {
  const run = await play(await readScenario('ping'), { count: 1 });
  const lan = { l1: '192.168.1.', l2: '192.168.1.', l3: '192.168.2.', l4: '192.168.2.' };
  const arpSends = run.events.filter((e) => e.type === 'send' && e.packet.protocol === 'arp');
  assert.ok(arpSends.length >= 4);
  for (const event of arpSends) {
    assert.ok(event.packet.data.senderIp.startsWith(lan[event.link]), `${event.packet.type} de ${event.packet.data.senderIp} sur ${event.link}`);
  }
});

test('2e requête d\'écho : tout est en cache, aucune nouvelle requête ARP (PC 2 a appris le routeur en répondant)', async () => {
  const run = await play(await readScenario('ping'), { count: 2 });
  assert.equal(arpRequestsFrom(run, 'pc1').length, 1);
  assert.equal(arpRequestsFrom(run, 'r1').length, 1);
  assert.equal(arpRequestsFrom(run, 'pc2').length, 0, 'la réponse d\'écho part sans ARP');
  assert.equal(run.events.filter((e) => e.type === 'send' && e.packet.type === 'echo-reply' && e.source === 'pc2').length, 2);
});

test('plusieurs paquets attendent la même adresse : une seule requête ARP, tous partent après la réponse', async () => {
  const run = await play(await readScenario('ping'), { count: 3, interval: 10 });
  assert.equal(arpRequestsFrom(run, 'pc1').length, 1);
  const echoes = run.events.filter((e) => e.type === 'send' && e.packet.type === 'echo-request' && e.source === 'pc1');
  assert.equal(echoes.length, 3);
  const reply = run.events.find((e) => e.type === 'receive' && e.packet.protocol === 'arp' && e.packet.type === 'reply' && e.destination === 'pc1');
  assert.ok(echoes.every((e) => e.time >= reply.time), 'aucune requête d\'écho ne part avant la réponse ARP');
  assert.equal(run.drops.length, 0);
});

test('réponse ARP arrivée après l\'abandon : le paquet est perdu, le cache est quand même mis à jour', async () => {
  const slow = variant(await readScenario('ping'), (s) => { s.links.find((l) => l.id === 'l2').latency = 2000; });
  const sim = await stepper(slow, { count: 1 });
  const events = [];
  sim.on(TOPICS.NETWORK, (event) => events.push(event));
  while (sim.getState().status !== 'finished') sim.step();

  const lost = events.find((e) => e.type === 'drop' && /ARP sans réponse/.test(e.reason));
  assert.ok(lost, 'requête d\'écho abandonnée');
  assert.equal(lost.time, ARP_TIMEOUT);
  assert.equal(events.filter((e) => e.type === 'send' && e.packet.type === 'echo-request').length, 0, 'le paquet abandonné ne repart pas');
  const lateReply = events.find((e) => e.type === 'receive' && e.packet.type === 'reply' && e.destination === 'pc1');
  assert.ok(lateReply.time > ARP_TIMEOUT, 'la réponse arrive après l\'abandon');
  assert.deepEqual(sim.getDeviceTables('pc1').arp, [{ ip: '192.168.1.1', mac: '02:00:00:00:00:a0' }]);
  assert.deepEqual(sim.getDeviceTables('pc1').pendingArp, []);
});

test('RFC 826 : un émetteur déjà connu est rafraîchi, même si la question ne nous vise pas ; un inconnu n\'est pas appris', () => {
  const { ctx, sent } = fakeCtx(LAN);
  const pc2 = LAN.devices.find((d) => d.id === 'pc2');
  const request = (senderMac, senderIp, targetIp) => ({
    id: 'p1', protocol: 'arp', type: 'request', ip: null,
    eth: { src: senderMac, dst: 'ff:ff:ff:ff:ff:ff' },
    data: { operation: 'request', senderMac, senderIp, targetMac: '00:00:00:00:00:00', targetIp },
  });
  const tables = () => networkTables(ctx.memory('pc2'));

  handleArp(ctx, pc2, request('02:00:00:00:00:01', '192.168.1.10', '192.168.1.30'), { interface: 'eth0' });
  assert.deepEqual(tables().arp, [], 'question pour le serveur, PC 1 inconnu : rien appris');
  assert.equal(sent.length, 0);

  handleArp(ctx, pc2, request('02:00:00:00:00:01', '192.168.1.10', '192.168.1.20'), { interface: 'eth0' });
  assert.deepEqual(tables().arp, [{ ip: '192.168.1.10', mac: '02:00:00:00:00:01' }], 'question pour PC 2 : demandeur appris');
  assert.equal(sent.length, 1);

  handleArp(ctx, pc2, request('02:00:00:00:00:99', '192.168.1.10', '192.168.1.30'), { interface: 'eth0' });
  assert.deepEqual(tables().arp, [{ ip: '192.168.1.10', mac: '02:00:00:00:00:99' }], 'MAC de PC 1 changée : entrée rafraîchie');
  assert.equal(sent.length, 1, 'pas de réponse : la question ne visait pas PC 2');
});

test('après un ping entre réseaux : PC 1 ne connaît que la MAC du routeur, le routeur connaît les deux côtés', async () => {
  const sim = await stepper(await readScenario('ping'), { count: 1 });
  while (sim.getState().status !== 'finished') sim.step();
  assert.deepEqual(sim.getDeviceTables('pc1').arp, [{ ip: '192.168.1.1', mac: '02:00:00:00:00:a0' }],
    'jamais la MAC de PC 2 : une adresse MAC ne sert que dans son réseau local');
  assert.deepEqual(sim.getDeviceTables('pc2').arp, [{ ip: '192.168.2.1', mac: '02:00:00:00:00:a1' }]);
  assert.deepEqual(sim.getDeviceTables('r1').arp, [
    { ip: '192.168.1.10', mac: '02:00:00:00:01:10' },
    { ip: '192.168.2.20', mac: '02:00:00:00:02:20' },
  ]);
});
