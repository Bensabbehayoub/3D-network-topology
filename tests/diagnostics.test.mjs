// Tests du diagnostic (src/sim/diagnostics.js) : une faute injectée par test, sur des scénarios réels.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countBySeverity, diagnose, RULES, segments, SEVERITIES, traceRoute } from '../src/sim/diagnostics.js';
import { createTrafficMeter } from '../src/sim/traffic.js';
import { TOPICS } from '../simulation.js';
import { play, readScenario, variant } from './netRun.js';

const rules = (findings) => findings.map((finding) => `${finding.rule}:${finding.target.id}`);
const only = (findings, rule) => findings.filter((finding) => finding.rule === rule);
const device = (scenario, id) => scenario.devices.find((d) => d.id === id);

test('scénarios corrects : aucun problème critique ni avertissement, seulement des conseils', async () => {
  for (const id of ['arp', 'ping', 'routage', 'ttl', 'udp', 'dns', 'dhcp', 'tcp', 'http']) {
    const findings = diagnose(await readScenario(id));
    assert.deepEqual(findings.filter((f) => f.severity !== 'conseil').map((f) => f.problem), [], id);
  }
});

test('forme d\'un résultat : gravité, cible, problème, cause, recommandation ; tri par gravité', async () => {
  const findings = diagnose(await readScenario('diagnostic'));
  for (const finding of findings) {
    assert.ok(SEVERITIES.includes(finding.severity));
    assert.ok(RULES.includes(finding.rule));
    assert.ok(['device', 'link'].includes(finding.target.kind) && finding.target.id && finding.target.label);
    for (const key of ['problem', 'cause', 'recommendation']) assert.ok(finding[key].length > 10, key);
  }
  const order = findings.map((f) => SEVERITIES.indexOf(f.severity));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.deepEqual(countBySeverity(findings), { critique: 3, avertissement: 3, conseil: 4 });
});

test('scenarios/diagnostic.json : les erreurs volontaires sont toutes trouvées', async () => {
  assert.deepEqual(rules(diagnose(await readScenario('diagnostic'))).filter((rule) => !rule.startsWith('single-point')).sort(), [
    'bottleneck:l4', 'cable-limit:l4', 'duplicate-ip:pc3', 'gateway:pc2', 'route:r2', 'speed-mismatch:l3',
  ]);
});

test('équipement isolé', async () => {
  const scenario = variant(await readScenario('ping'), (s) => { s.devices.push({ id: 'pc9', type: 'host', label: 'PC 9', interfaces: [{ name: 'eth0', mac: '02:00:00:00:09:09', ip: '192.168.1.99/24' }], gateway: '192.168.1.1' }); });
  assert.ok(rules(diagnose(scenario)).includes('isolated:pc9'));
});

test('adresse MAC en double', async () => {
  const scenario = variant(await readScenario('ping'), (s) => { device(s, 'pc2').interfaces[0].mac = device(s, 'pc1').interfaces[0].mac; });
  const [finding] = only(diagnose(scenario), 'duplicate-mac');
  assert.equal(finding.severity, 'critique');
  assert.match(finding.cause, /PC 1 et PC 2/);
});

test('passerelle : absente, hors sous-réseau, introuvable', async () => {
  const base = await readScenario('ping');
  const absent = variant(base, (s) => { delete device(s, 'pc1').gateway; });
  assert.equal(only(diagnose(absent), 'gateway')[0].problem, 'Passerelle absente');
  const wrong = variant(base, (s) => { device(s, 'pc1').gateway = '192.168.1.254'; });
  assert.equal(only(diagnose(wrong), 'gateway')[0].problem, 'Passerelle introuvable');
  assert.equal(only(diagnose(wrong), 'gateway')[0].severity, 'critique');
  const outside = variant(base, (s) => { device(s, 'pc2').gateway = '192.168.1.1'; });
  assert.equal(only(diagnose(outside), 'gateway')[0].problem, 'Passerelle hors du sous-réseau');
});

test('sous-réseaux mélangés sur un même segment', async () => {
  const scenario = variant(await readScenario('arp'), (s) => { device(s, 'pc3').interfaces[0].ip = '10.1.1.30/24'; });
  const [finding] = only(diagnose(scenario), 'mixed-subnets');
  assert.equal(finding.target.id, 'pc3');
  assert.match(finding.cause, /192\.168\.1\.0\/24/);
});

test('routes : route manquante, routeur suivant introuvable, boucle de routage', async () => {
  const base = await readScenario('routage');
  const missing = variant(base, (s) => { delete device(s, 'r1').routes; });
  assert.deepEqual(rules(only(diagnose(missing), 'route')), ['route:r1']);
  const badVia = variant(base, (s) => { device(s, 'r1').routes = [{ network: '192.168.3.0/24', via: '10.0.0.3' }]; });
  assert.equal(only(diagnose(badVia), 'route')[0].problem, 'Routeur suivant introuvable');
  const loop = variant(base, (s) => { device(s, 'r2').routes = [{ network: '0.0.0.0/0', via: '10.0.0.1' }]; device(s, 'r1').routes = [{ network: '0.0.0.0/0', via: '10.0.0.2' }]; device(s, 'srv1').gateway = '192.168.3.1'; device(s, 'srv1').interfaces[0].ip = '192.168.3.10/24'; s.devices.find((d) => d.id === 'r2').interfaces[1].ip = '192.168.4.1/24'; });
  const segmentOf = segments(loop);
  const trace = traceRoute(loop, device(loop, 'pc1'), '192.168.3.10', segmentOf);
  assert.equal(trace.kind, 'loop');
  assert.equal(trace.ok, false);
});

test('DHCP : client sans serveur dans son réseau local', async () => {
  const scenario = variant(await readScenario('dhcp'), (s) => { delete device(s, 'srv1').dhcp; });
  assert.deepEqual(rules(only(diagnose(scenario), 'dhcp')), ['dhcp:pc1', 'dhcp:pc2']);
});

test('DNS : serveur absent de la configuration, ou introuvable', async () => {
  const base = await readScenario('http');
  assert.equal(only(diagnose(variant(base, (s) => { delete device(s, 'pc1').dns; })), 'dns')[0].problem, 'Aucun serveur DNS configuré');
  assert.equal(only(diagnose(variant(base, (s) => { device(s, 'pc1').dns = '192.168.2.80'; })), 'dns')[0].problem, 'Serveur DNS introuvable');
});

test('point de défaillance unique : signalé, puis levé par un chemin de secours', async () => {
  const base = await readScenario('arp');
  assert.deepEqual(rules(only(diagnose(base), 'single-point')), ['single-point:sw1']);
  const redundant = variant(base, (s) => {
    s.devices.push({ id: 'sw2', type: 'switch', label: 'Switch B', interfaces: [{ name: 'p1' }, { name: 'p2' }, { name: 'p3' }] });
    for (const id of ['pc1', 'pc2', 'pc3']) device(s, id).interfaces.push({ name: 'eth1', mac: `02:00:00:00:0a:0${id.at(-1)}` });
    s.links.push({ id: 'l11', a: 'pc1:eth1', b: 'sw2:p1' }, { id: 'l12', a: 'pc2:eth1', b: 'sw2:p2' }, { id: 'l13', a: 'pc3:eth1', b: 'sw2:p3' });
  });
  assert.deepEqual(only(diagnose(redundant), 'single-point'), []);
});

test('boucle de commutation : un câble qui ferme un cycle entre switches', async () => {
  const scenario = variant(await readScenario('arp'), (s) => {
    s.devices.push({ id: 'sw2', type: 'switch', label: 'Switch B', interfaces: [{ name: 'p1' }, { name: 'p2' }] });
    device(s, 'sw1').interfaces.push({ name: 'p4' }, { name: 'p5' });
    s.links.push({ id: 'l20', a: 'sw1:p4', b: 'sw2:p1' }, { id: 'l21', a: 'sw1:p5', b: 'sw2:p2' });
  });
  const [finding] = only(diagnose(scenario), 'switching-loop');
  assert.equal(finding.severity, 'critique');
  assert.equal(finding.target.id, 'l21');
});

test('goulot d\'étranglement mesuré : lien saturé pendant la simulation de débit', async () => {
  const scenario = await readScenario('debit');
  const meter = createTrafficMeter();
  let saturated = null;
  await play(scenario, {}, (sim) => sim.on(TOPICS.NETWORK, (event) => {
    meter.add(event);
    if (!saturated && event.time > 5000) saturated = only(diagnose(scenario, { traffic: meter.snapshot(scenario, event.time) }), 'saturated');
  }));
  assert.deepEqual(rules(saturated), ['saturated:l4']);
  assert.match(saturated[0].cause, /Utilisation mesurée : (9\d|100) %/);
  assert.deepEqual(rules(only(diagnose(scenario), 'bottleneck')), ['bottleneck:l4'], 'et le goulot structurel, sans trafic');
});
