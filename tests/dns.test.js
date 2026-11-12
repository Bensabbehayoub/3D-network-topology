// Tests de DNS (src/sim/protocols/dns.js) avec le vrai moteur.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateScenario } from '../simulation.js';
import dns from '../src/sim/protocols/dns.js';
import { play, readScenario, variant } from './netRun.js';

const dnsSends = (run) => run.events.filter((e) => e.type === 'send' && e.packet.protocol === 'dns' && (e.source === 'pc1' || e.source === 'dns1'));

test('scenarios/dns.json : requête, réponse, cache, NXDOMAIN', async () => {
  const scenario = await readScenario('dns');
  assert.deepEqual(validateScenario(scenario).errors, []);
  const run = await play(scenario);
  assert.deepEqual(run.steps, scenario.steps.map((step) => step.id));
  // 3 demandes, mais 2 requêtes seulement : la deuxième est servie par le cache.
  const messages = dnsSends(run);
  assert.deepEqual(messages.map((e) => `${e.source} ${e.packet.type} ${e.packet.data.question.name}`), [
    'pc1 query www.ecole.test', 'dns1 response www.ecole.test',
    'pc1 query inconnu.ecole.test', 'dns1 response inconnu.ecole.test',
  ]);
  const [query, answer, , nx] = messages.map((e) => e.packet);
  assert.deepEqual(query.transport, { protocol: 'udp', src: 49152, dst: 53 });
  assert.deepEqual(answer.transport, { protocol: 'udp', src: 53, dst: 49152 }, 'réponse vers le port de la requête');
  assert.equal(answer.data.id, query.data.id, 'même identifiant');
  assert.deepEqual(answer.data.answers, [{ name: 'www.ecole.test', type: 'A', ttl: 300, value: '192.168.2.80' }]);
  assert.equal(nx.data.rcode, 'NXDOMAIN');
  assert.deepEqual(nx.data.answers, []);
  assert.equal(run.drops.length, 0);
});

test('TTL de 0 : pas de cache, la deuxième demande repart sur le réseau', async () => {
  const scenario = variant(await readScenario('dns'), (s) => {
    s.devices.find((d) => d.id === 'dns1').records[0].ttl = 0;
    s.params.names = ['www.ecole.test', 'www.ecole.test'];
  });
  const run = await play(scenario);
  assert.equal(dnsSends(run).filter((e) => e.packet.type === 'query').length, 2);
});

test('hôte sans serveur DNS : échec immédiat, aucun paquet', async () => {
  const scenario = variant(await readScenario('dns'), (s) => {
    delete s.devices.find((d) => d.id === 'pc1').dns;
    s.params.names = ['www.ecole.test'];
    s.steps.push({ id: 'dns-no-server', title: 'Pas de DNS', text: 'Aucun serveur DNS configuré.' });
  });
  const run = await play(scenario);
  assert.equal(run.events.length, 0);
  assert.ok(run.steps.includes('dns-no-server'));
});

test('serveur DNS injoignable : délai écoulé', async () => {
  const scenario = variant(await readScenario('dns'), (s) => {
    s.devices.find((d) => d.id === 'pc1').dns = '192.168.2.99';
    s.params.names = ['www.ecole.test'];
    s.params.timeout = 7000;
    s.steps.push({ id: 'dns-timeout', title: 'Pas de réponse', text: 'Le serveur ne répond pas.' });
  });
  const run = await play(scenario);
  assert.ok(run.steps.includes('dns-timeout'));
  assert.ok(run.drops.some((d) => d.source === 'r1' && /ARP sans réponse/.test(d.reason)));
});

test('describe : identifiant, question, code et réponses', () => {
  const fields = dns.describe({ id: 'p1', protocol: 'dns', type: 'response', eth: null, ip: { src: '1.1.1.1', dst: '2.2.2.2', ttl: 64 },
    transport: { protocol: 'udp', src: 53, dst: 49152 },
    data: { id: 0x2a00, question: { name: 'www.ecole.test', type: 'A' }, rcode: 'NOERROR', answers: [{ name: 'www.ecole.test', type: 'A', ttl: 300, value: '192.168.2.80' }] } });
  assert.equal(fields.find((f) => f.field === 'Identifiant').value, '0x2a00');
  assert.equal(fields.find((f) => f.field === 'Réponse').value, 'www.ecole.test A 192.168.2.80 (TTL 300 s)');
});
