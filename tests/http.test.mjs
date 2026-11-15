// Tests de HTTP (src/sim/protocols/http.js) : DNS, TCP, GET, 200, 404, connexion persistante.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateScenario } from '../simulation.js';
import http, { parseUrl, respond } from '../src/sim/protocols/http.js';
import { play, readScenario, variant } from './netRun.js';

const ends = (run) => run.events.filter((e) => e.type === 'send' && ['pc1', 'web1', 'dns1'].includes(e.source));

test('scenarios/http.json : DNS, puis une seule connexion TCP pour deux requêtes, 200 puis 404', async () => {
  const scenario = await readScenario('http');
  assert.deepEqual(validateScenario(scenario).errors, []);
  const run = await play(scenario);
  assert.deepEqual(run.steps, scenario.steps.map((step) => step.id));
  assert.equal(run.drops.length, 0);
  const sequence = ends(run).filter((e) => e.packet.protocol !== 'arp').map((e) => `${e.source} ${e.packet.protocol}/${e.packet.type}`);
  assert.deepEqual(sequence, [
    'pc1 dns/query', 'dns1 dns/response',
    'pc1 tcp/syn', 'web1 tcp/syn-ack', 'pc1 tcp/ack',
    'pc1 http/request', 'web1 tcp/ack',
    'web1 http/response', 'web1 http/response', 'web1 http/response',
    'pc1 tcp/ack', 'pc1 tcp/ack', 'pc1 tcp/ack',
    'pc1 http/request', 'web1 tcp/ack', 'web1 http/response', 'pc1 tcp/ack',
    'pc1 tcp/fin', 'web1 tcp/fin-ack', 'pc1 tcp/ack',
  ]);
  assert.equal(ends(run).filter((e) => e.packet.type === 'syn').length, 1, 'connexion persistante : une seule poignée de main');
  const responses = ends(run).filter((e) => e.packet.protocol === 'http' && e.packet.type === 'response').map((e) => e.packet.data);
  assert.deepEqual(responses.map((d) => `${d.message.status} ${d.part}/${d.parts} ${d.length}`), ['200 1/3 1000', '200 2/3 1000', '200 3/3 650', '404 1/1 430']);
  const request = ends(run).find((e) => e.packet.protocol === 'http' && e.packet.type === 'request').packet;
  assert.equal(request.ip.dst, '192.168.2.80', 'adresse obtenue par DNS');
  assert.equal(request.transport.dst, 80);
  assert.deepEqual([request.data.message.method, request.data.message.path, request.data.message.host], ['GET', '/', 'www.ecole.test']);
});

test('nom inconnu : échec DNS, aucune connexion TCP', async () => {
  const scenario = variant(await readScenario('http'), (s) => {
    s.params.urls = ['http://absent.ecole.test/'];
    s.steps.push({ id: 'http-dns-failed', title: 'Introuvable', text: 'Nom inconnu.' });
  });
  const run = await play(scenario);
  assert.ok(run.steps.includes('http-dns-failed'));
  assert.equal(run.events.filter((e) => e.packet.transport?.protocol === 'tcp').length, 0);
});

test('serveur web sans service sur le port 80 : RST, connexion refusée', async () => {
  const scenario = variant(await readScenario('http'), (s) => {
    s.devices.find((d) => d.id === 'web1').services = [];
    s.steps.push({ id: 'http-failed', title: 'Refusée', text: 'Connexion refusée.' });
  });
  const run = await play(scenario);
  assert.ok(run.steps.includes('http-failed'));
  assert.ok(run.events.some((e) => e.type === 'send' && e.source === 'web1' && e.packet.type === 'rst'));
});

test('adresses et réponses', () => {
  assert.deepEqual(parseUrl('http://www.ecole.test/'), { host: 'www.ecole.test', port: 80, path: '/' });
  assert.deepEqual(parseUrl('http://WWW.ecole.test:8080/a/b'), { host: 'www.ecole.test', port: 8080, path: '/a/b' });
  assert.deepEqual(parseUrl('http://www.ecole.test'), { host: 'www.ecole.test', port: 80, path: '/' });
  assert.equal(parseUrl('https://www.ecole.test/'), null, 'HTTPS (TLS) n\'est pas simulé ici');
  assert.equal(parseUrl('pas une adresse'), null);
  const server = { pages: [{ path: '/', size: 2400, type: 'text/html', title: 'Accueil' }] };
  assert.deepEqual([respond(server, '/').status, respond(server, '/').size], [200, 2650]);
  assert.deepEqual([respond(server, '/x').status, respond(server, '/x').reason], [404, 'Not Found']);
});

test('describe : requête, statut et suite du message', () => {
  const base = { id: 'p1', protocol: 'http', eth: null, ip: { src: '1.1.1.1', dst: '2.2.2.2', ttl: 64 }, transport: { protocol: 'tcp', src: 49152, dst: 80, flags: ['PSH', 'ACK'], seq: 1001, ack: 5001 } };
  const request = http.describe({ ...base, type: 'request', data: { length: 251, part: 1, parts: 1, message: { kind: 'request', method: 'GET', path: '/', version: 'HTTP/1.1', host: 'www.ecole.test' } } });
  assert.equal(request.find((f) => f.field === 'Requête').value, 'GET / HTTP/1.1');
  const response = http.describe({ ...base, type: 'response', data: { length: 1000, part: 1, parts: 3, message: { kind: 'response', version: 'HTTP/1.1', status: 200, reason: 'OK', contentType: 'text/html', body: 2400 } } });
  assert.equal(response.find((f) => f.field === 'Statut').value, 'HTTP/1.1 200 OK');
  const second = http.describe({ ...base, type: 'response', data: { length: 1000, part: 2, parts: 3, message: { kind: 'response' } } });
  assert.equal(second.find((f) => f.field === 'Suite du message').value, 'partie 2 sur 3');
});
