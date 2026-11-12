// Tests de la construction de topologie (src/sim/builder.js) : opérations pures et scénarios valides.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDevice, BuilderError, connect, disconnect, freePorts, fromScenario, moveDevice, newTopology, palette, removeDevice, renameDevice,
} from '../src/sim/builder.js';
import { validateScenario } from '../src/sim/scenario.js';
import { readScenario } from './netRun.js';

/** Petit réseau : 2 PC, un switch. */
function smallNetwork() {
  let s = newTopology();
  ({ scenario: s } = addDevice(s, { model: 'pc-1g', position: [-3, 0, 0] }));
  ({ scenario: s } = addDevice(s, { model: 'pc-1g', position: [3, 0, 0] }));
  ({ scenario: s } = addDevice(s, { model: 'sw-24g' }));
  return s;
}

test('topologie vide : valide, protocole « aucun », chargeable', () => {
  const s = newTopology();
  assert.deepEqual(validateScenario(s).errors, []);
  assert.equal(s.protocol, 'aucun');
  assert.deepEqual(s.devices, []);
});

test('ajout : identifiants et noms numérotés, interfaces du modèle, MAC uniques, position', () => {
  const s = smallNetwork();
  assert.deepEqual(s.devices.map((d) => `${d.id} ${d.label} ${d.type} ${d.interfaces.length}`), ['pc1 PC 1 host 1', 'pc2 PC 2 host 1', 'sw1 Switch 1 switch 28']);
  assert.deepEqual(s.devices[0].position, [-3, 0, 0]);
  assert.equal(s.devices[2].interfaces[0].name, 'p1');
  assert.equal(s.devices[2].interfaces[0].mac, undefined, 'pas de MAC sur un port de switch');
  const macs = s.devices.flatMap((d) => d.interfaces.map((i) => i.mac).filter(Boolean));
  assert.equal(new Set(macs).size, macs.length);
  const { scenario: withRouter, id } = addDevice(s, { model: 'rt-4g' });
  assert.equal(id, 'r1');
  assert.deepEqual(withRouter.devices.at(-1).interfaces.map((i) => i.name), ['g0', 'g1', 'g2', 'g3']);
  assert.deepEqual(validateScenario(withRouter).errors, []);
  assert.equal(s.devices.length, 3, 'opérations pures : le scénario de départ ne change pas');
  assert.throws(() => addDevice(s, { model: 'inconnu' }), BuilderError);
});

test('numérotation : un numéro libéré est réutilisé, pas de doublon après renommage', () => {
  let s = smallNetwork();
  s = removeDevice(s, 'pc1');
  const { id, scenario } = addDevice(s, { model: 'pc-1g' });
  assert.equal(id, 'pc1');
  assert.equal(scenario.devices.at(-1).label, 'PC 1');
  const renamed = renameDevice(scenario, 'pc2', 'PC 3');
  assert.equal(addDevice(renamed, { model: 'pc-1g' }).scenario.devices.at(-1).label, 'PC 4', '« PC 3 » est déjà pris');
});

test('déplacer, renommer : contrôles et messages en français', () => {
  const s = smallNetwork();
  assert.deepEqual(moveDevice(s, 'pc1', [1, 0, 2]).devices[0].position, [1, 0, 2]);
  assert.throws(() => moveDevice(s, 'pc1', [1, 0]), /Position invalide/);
  assert.equal(renameDevice(s, 'pc1', '  Poste accueil ').devices[0].label, 'Poste accueil');
  assert.throws(() => renameDevice(s, 'pc1', '   '), /ne peut pas être vide/);
  assert.throws(() => renameDevice(s, 'pc1', 'x'.repeat(31)), /30 caractères/);
  assert.throws(() => renameDevice(s, 'pc1', 'PC 2'), /s'appelle déjà « PC 2 »/);
  assert.throws(() => renameDevice(s, 'zz', 'A'), /introuvable/);
});

test('câbles : relier deux ports libres, refus clairs, ports libres, suppression', () => {
  let s = smallNetwork();
  ({ scenario: s } = connect(s, { a: 'pc1:eth0', b: 'sw1:p1' }));
  const result = connect(s, { a: 'pc2:eth0', b: 'sw1:p2', cable: 'cuivre-cat5' });
  s = result.scenario;
  assert.equal(result.id, 'l2');
  assert.deepEqual(s.links, [{ id: 'l1', a: 'pc1:eth0', b: 'sw1:p1', cable: 'cuivre-cat6' }, { id: 'l2', a: 'pc2:eth0', b: 'sw1:p2', cable: 'cuivre-cat5' }]);
  assert.deepEqual(validateScenario(s).errors, []);
  assert.deepEqual(freePorts(s, 'pc1'), []);
  assert.equal(freePorts(s, 'sw1').length, 26);
  assert.throws(() => connect(s, { a: 'pc1:eth0', b: 'sw1:p3' }), /port eth0 de PC 1 est déjà relié/);
  assert.throws(() => connect(s, { a: 'sw1:p3', b: 'sw1:p4' }), /deux équipements différents/);
  assert.throws(() => connect(s, { a: 'sw1:p3', b: '' }), /Choisissez un port/);
  assert.throws(() => connect(s, { a: 'sw1:p99', b: 'pc1:eth0' }), /pas de port « p99 »/);
  assert.throws(() => connect(s, { a: 'sw1:p3', b: 'pc2:eth9', cable: 'x' }), /pas de port/);
  s = disconnect(s, 'l1');
  assert.deepEqual(freePorts(s, 'pc1'), ['eth0']);
  assert.throws(() => disconnect(s, 'l9'), /introuvable/);
  assert.equal(removeDevice(s, 'sw1').links.length, 0, 'retirer un équipement retire ses câbles');
});

test('repartir d\'un scénario fourni : même réseau, protocole remis à « aucun »', async () => {
  const scenario = await readScenario('ping');
  const copy = fromScenario(scenario);
  assert.equal(copy.title, 'Ping : joindre un PC d\'un autre réseau (copie)');
  assert.equal(copy.protocol, 'aucun');
  assert.deepEqual(copy.params, {});
  assert.equal(copy.devices.length, scenario.devices.length);
  assert.deepEqual(validateScenario(copy).errors, []);
});

test('palette : un groupe par type, avec ses modèles du catalogue', () => {
  const groups = palette();
  assert.deepEqual(groups.map((g) => g.label), ['PC', 'Serveur', 'Switch', 'Routeur']);
  assert.ok(groups.every((g) => g.models.length > 0));
  assert.ok(groups.find((g) => g.type === 'switch').models.some((m) => m.reference === 'ACC-24G'));
});
