// Tests de la configuration (src/sim/config.js) et du choix du protocole (src/sim/runs.js) :
// un réseau construit de zéro avec les fonctions de l'éditeur, puis chaque protocole joué dessus.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDevice, BuilderError, connect, newTopology } from '../src/sim/builder.js';
import {
  addRecord, addRoute, addService, proposeAddress, proposeGateway, removeRoute, rolesOf, setAddress, setDns, setGateway, setRole,
} from '../src/sim/config.js';
import { assembleRun, defaultValues, RUNS, runFields, validateRun } from '../src/sim/runs.js';
import { validateScenario } from '../src/sim/scenario.js';
import { diagnose } from '../src/sim/diagnostics.js';
import { play } from './netRun.js';

const ipOf = (s, id) => s.devices.find((d) => d.id === id).interfaces.find((i) => i.ip)?.ip.split('/')[0];

/** Deux réseaux reliés par un routeur, configurés uniquement avec les adresses proposées. */
function campus() {
  let s = newTopology();
  const add = (model) => { const r = addDevice(s, { model }); s = r.scenario; return r.id; };
  const [pc1, pc2, pc3, srvA, sw1, r1, sw2, web, dns] = ['pc-1g', 'pc-1g', 'pc-1g', 'srv-1g', 'sw-24g', 'rt-4g', 'sw-24g', 'srv-1g', 'srv-1g'].map(add);
  for (const [a, b] of [[`${pc1}:eth0`, `${sw1}:p1`], [`${pc2}:eth0`, `${sw1}:p2`], [`${pc3}:eth0`, `${sw1}:p3`], [`${srvA}:eth0`, `${sw1}:p4`],
    [`${sw1}:p5`, `${r1}:g0`], [`${r1}:g1`, `${sw2}:p1`], [`${sw2}:p2`, `${web}:eth0`], [`${sw2}:p3`, `${dns}:eth0`]]) {
    s = connect(s, { a, b }).scenario;
  }
  // Adresses proposées : le routeur d'abord (il prend .1), puis les autres.
  s = setAddress(s, r1, 'g0', proposeAddress(s, r1, 'g0'));
  s = setAddress(s, r1, 'g1', proposeAddress(s, r1, 'g1'));
  for (const [id, itf] of [[pc1, 'eth0'], [pc2, 'eth0'], [srvA, 'eth0'], [web, 'eth0'], [dns, 'eth0']]) s = setAddress(s, id, itf, proposeAddress(s, id, itf));
  for (const id of [pc1, pc2, srvA, web, dns]) s = setGateway(s, id, proposeGateway(s, id));
  s = setRole(s, web, 'web', true);
  s = setRole(s, dns, 'dns', true);
  s = setRole(s, srvA, 'dhcp', true);
  for (const id of [pc1, pc2]) s = setDns(s, id, ipOf(s, dns));
  s = addService(s, web, { transport: 'tcp', port: 9000, name: 'sauvegarde' });
  return s;
}

test('adresses proposées : un réseau par segment, .1 pour le routeur, .10 et suivantes pour les hôtes', () => {
  const s = campus();
  assert.deepEqual(['r1', 'pc1', 'pc2', 'srv1'].map((id) => ipOf(s, id)), ['192.168.1.1', '192.168.1.10', '192.168.1.11', '192.168.1.12']);
  assert.equal(s.devices.find((d) => d.id === 'r1').interfaces[1].ip, '192.168.2.1/24', 'autre côté du routeur : nouveau réseau');
  assert.deepEqual(['srv2', 'srv3'].map((id) => ipOf(s, id)), ['192.168.2.10', '192.168.2.11']);
  assert.equal(s.devices.find((d) => d.id === 'pc1').gateway, '192.168.1.1');
  assert.equal(s.devices.find((d) => d.id === 'srv2').gateway, '192.168.2.1');
  assert.deepEqual(validateScenario(s).errors, []);
  assert.deepEqual(diagnose(s).filter((f) => f.severity !== 'conseil').map((f) => f.problem), [], 'aucun problème avec les valeurs proposées');
  assert.equal(proposeAddress(s, 'sw1', 'p1'), null, 'un switch n\'a pas d\'adresse');
});

test('rôles : ports ouverts, plage DHCP, enregistrements DNS, page web proposés', () => {
  const s = campus();
  const device = (id) => s.devices.find((d) => d.id === id);
  assert.deepEqual(rolesOf(device('srv1')), ['dhcp']);
  assert.deepEqual(device('srv1').dhcp, { start: '192.168.1.100', end: '192.168.1.150', prefix: 24, gateway: '192.168.1.1', dns: '192.168.2.11', lease: 86400 });
  assert.deepEqual(device('srv3').records, [{ name: 'www.ecole.test', type: 'A', value: '192.168.2.10', ttl: 300 }]);
  assert.deepEqual(device('srv2').pages.map((p) => p.path), ['/']);
  assert.deepEqual(rolesOf(device('srv2')), ['web']);
  const off = setRole(s, 'srv2', 'web', false);
  assert.deepEqual(rolesOf(off.devices.find((d) => d.id === 'srv2')), []);
  assert.ok(off.devices.find((d) => d.id === 'srv2').services.some((sv) => sv.port === 9000), 'les autres ports restent ouverts');
  assert.throws(() => setRole(s, 'pc3', 'dns', true), /adresse IP fixe/);
  const withRecord = addRecord(s, 'srv3', { name: 'Intranet.ecole.test', value: '192.168.2.10' });
  assert.equal(withRecord.devices.find((d) => d.id === 'srv3').records.at(-1).name, 'intranet.ecole.test');
  assert.throws(() => addRecord(s, 'srv3', { name: 'intranet', value: '1.2.3.4' }), /nom de domaine complet/);
});

test('adresses : contrôles et messages en français', () => {
  const s = campus();
  assert.throws(() => setAddress(s, 'pc3', 'eth0', '192.168.1.10/24'), /déjà utilisée/);
  assert.throws(() => setAddress(s, 'pc3', 'eth0', '192.168.1.0/24'), /adresse du réseau/);
  assert.throws(() => setAddress(s, 'pc3', 'eth0', '192.168.1.255/24'), /adresse de diffusion/);
  assert.throws(() => setAddress(s, 'pc3', 'eth0', '300.1.1.1'), /n'est pas une adresse valide/);
  assert.throws(() => setAddress(s, 'pc3', 'eth0', '10.0.0.5/31'), /entre \/8 et \/30/);
  assert.throws(() => setAddress(s, 'sw1', 'p1', '192.168.1.50/24'), /switch/);
  assert.equal(setAddress(s, 'pc3', 'eth0', '192.168.1.60').devices.find((d) => d.id === 'pc3').interfaces[0].ip, '192.168.1.60/24', '/24 par défaut');
  assert.equal(setAddress(s, 'pc1', 'eth0', '').devices.find((d) => d.id === 'pc1').interfaces[0].ip, undefined, 'adresse effacée (client DHCP)');
  assert.throws(() => setGateway(s, 'pc1', 'routeur'), /adresse IPv4/);
  assert.throws(() => addRoute(s, 'r1', { network: '10.9.0.0/16', via: '172.16.0.1' }), /voisin/);
  const routed = addRoute(s, 'r1', { network: '10.9.0.0/16', via: '192.168.2.11' });
  assert.deepEqual(routed.devices.find((d) => d.id === 'r1').routes, [{ network: '10.9.0.0/16', via: '192.168.2.11' }]);
  assert.equal(removeRoute(routed, 'r1', '10.9.0.0/16').devices.find((d) => d.id === 'r1').routes, undefined);
  assert.throws(() => addRoute(s, 'pc1', { network: '0.0.0.0/0', via: '192.168.1.1' }), BuilderError);
});

test('formulaires : champs et valeurs proposées pour chaque protocole', () => {
  const s = campus();
  for (const run of RUNS) {
    const fields = runFields(s, run.id);
    assert.ok(fields.length > 0, run.id);
    const values = defaultValues(s, run.id);
    for (const field of fields) assert.ok(field.key in values, `${run.id}.${field.key}`);
  }
  assert.deepEqual(defaultValues(s, 'dhcp').clients, ['pc3']);
  assert.equal(defaultValues(s, 'http').url, 'http://www.ecole.test/');
  assert.equal(defaultValues(s, 'dns').client, 'pc1');
});

test('chaque protocole se joue de bout en bout sur la topologie construite', async () => {
  const s = campus();
  const values = {
    ping: { ...defaultValues(s, 'ping'), source: 'pc1', target: 'srv2' },
    routage: { ...defaultValues(s, 'routage'), source: 'pc1', target: 'srv3' },
    arp: { source: 'pc1', target: 'pc2' },
    udp: { source: 'pc1', target: 'srv1', port: 67, count: 1, closedPort: 5000 },
    dns: defaultValues(s, 'dns'),
    dhcp: defaultValues(s, 'dhcp'),
    tcp: { client: 'pc1', server: 'srv2', port: 9000, size: 3000, loseSegment: 2 },
    http: defaultValues(s, 'http'),
    debit: { sources: ['pc1', 'pc2'], server: 'srv2', port: 9000, size: 5000 },
  };
  const ending = { ping: 'icmp-summary', routage: 'icmp-summary', arp: 'arp-done', udp: 'udp-summary', dns: 'dns-summary', dhcp: 'dhcp-summary', tcp: 'tcp-summary', http: 'http-summary', debit: 'tcp-summary' };
  for (const run of RUNS) {
    const check = validateRun(s, run.id, values[run.id]);
    assert.deepEqual(check.errors, [], run.id);
    const scenario = assembleRun(s, run.id, check.params);
    assert.deepEqual(validateScenario(scenario).errors, [], run.id);
    const result = await play(scenario);
    assert.equal(result.state.status, 'finished', run.id);
    assert.ok(result.steps.includes(ending[run.id]), `${run.id} : ${result.steps.join(', ')}`);
  }
});

test('validation : messages clairs, avertissements non bloquants, boucle de commutation bloquante', () => {
  const s = campus();
  assert.match(validateRun(s, 'ping', { source: 'pc1', target: 'pc1', count: 1, ttl: 64 }).errors[0], /différentes/);
  assert.match(validateRun(s, 'ping', { source: 'pc3', target: 'pc1', count: 1, ttl: 64 }).errors.join(), /PC 3 n'a pas d'adresse IP/);
  assert.match(validateRun(s, 'ping', { source: 'pc1', target: 'srv2', count: 9, ttl: 64 }).errors[0], /Nombre de requêtes : un nombre entier de 1 à 5/);
  assert.match(validateRun(s, 'dhcp', { clients: ['pc1'] }).errors[0], /déjà une adresse fixe/);
  assert.match(validateRun(s, 'dns', { client: 'srv1', names: 'www.ecole.test' }).errors[0], /pas de serveur DNS/);
  assert.match(validateRun(s, 'http', { client: 'pc1', url: 'https://www.ecole.test/' }).errors[0], /HTTPS n'est pas simulé/);
  const tcp = validateRun(s, 'tcp', { client: 'pc1', server: 'srv2', port: 22, size: 1000, loseSegment: 0 });
  assert.deepEqual(tcp.errors, []);
  assert.match(tcp.warnings[0], /n'écoute pas le port TCP 22 : la connexion sera refusée/);
  assert.match(validateRun(s, 'inconnu', {}).errors[0], /Choisissez un protocole/);
  // Boucle entre deux switches : lecture bloquée.
  let looped = addDevice(s, { model: 'sw-24g' }).scenario;
  looped = connect(looped, { a: 'sw1:p10', b: 'sw3:p1' }).scenario;
  looped = connect(looped, { a: 'sw1:p11', b: 'sw3:p2' }).scenario;
  assert.match(validateRun(looped, 'ping', { source: 'pc1', target: 'pc2', count: 1, ttl: 64 }).errors[0], /Boucle de commutation/);
});

test('explications générées avec les noms des équipements', () => {
  const s = campus();
  const scenario = assembleRun(s, 'ping', validateRun(s, 'ping', { source: 'pc1', target: 'srv2', count: 1, ttl: 64 }).params);
  assert.equal(scenario.protocol, 'icmp');
  assert.equal(scenario.steps.find((step) => step.id === 'icmp-start').text, 'PC 1 envoie des requêtes d\'écho ICMP à Serveur 2 et attend chaque réponse.');
  assert.ok(scenario.steps.every((step) => !/\{\w+\}/.test(step.text)));
});
