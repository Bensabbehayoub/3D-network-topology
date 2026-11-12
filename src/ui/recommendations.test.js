// Tests du panneau « Recommandations » et des onglets (phase 6). Vrai moteur, sans DOM.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createSimulation, createTrafficMeter, diagnose, transmissionModel, TOPICS } from '../../simulation.js';
import { DEVICE_BEHAVIOURS } from '../sim/devices/index.js';
import { createRecommendationsController, EMPTY_TEXT, mount, recommendationsView, UNAVAILABLE_TEXT } from './recommendations.js';
import { nextTabIndex } from './tabs.js';

/** Comme src/sim/index.js : moteur, compteur de trafic et diagnose(). */
async function simFor(id) {
  const scenario = JSON.parse(await readFile(new URL(`../../scenarios/${id}.json`, import.meta.url), 'utf8'));
  const sim = createSimulation({ devices: DEVICE_BEHAVIOURS, transmission: transmissionModel, scheduler: { start: () => () => {} } });
  const meter = createTrafficMeter();
  sim.on(TOPICS.NETWORK, (event) => meter.add(event));
  sim.on(TOPICS.RESET, () => meter.reset());
  await sim.load(scenario);
  return { ...sim, diagnose: () => diagnose(sim.getScenario(), { traffic: meter.snapshot(sim.getScenario(), sim.getState().time) }) };
}

test('vue : compteurs, pastille (critiques + avertissements), messages', () => {
  const findings = [
    { id: 'a', severity: 'critique', target: { kind: 'device', id: 'pc1', label: 'PC 1' }, problem: 'P', cause: 'C', recommendation: 'R' },
    { id: 'b', severity: 'conseil', target: { kind: 'link', id: 'l1', label: 'A ↔ B' }, problem: 'P', cause: 'C', recommendation: 'R' },
  ];
  const view = recommendationsView(findings, 'b');
  assert.deepEqual(view.counts, { critique: 1, avertissement: 0, conseil: 1 });
  assert.equal(view.badge, '1', 'les conseils ne comptent pas dans la pastille');
  assert.deepEqual(view.items.map((item) => [item.severityLabel, item.selected]), [['Critique', false], ['Conseil', true]]);
  assert.equal(recommendationsView([]).message, EMPTY_TEXT);
  assert.equal(recommendationsView([]).badge, '');
  assert.equal(recommendationsView(null).message, UNAVAILABLE_TEXT);
});

test('choisir un problème : équipement sélectionné, ou lien mis en évidence', async () => {
  const sim = await simFor('diagnostic');
  const calls = [];
  const app = { sim, render: { highlightLink: (id) => calls.push(`lien ${id}`), focusDevice: (id) => calls.push(`focus ${id}`) } };
  const selection = { select: (id) => calls.push(`sélection ${id}`), clear: () => calls.push('sélection vide') };
  const views = [];
  const controller = createRecommendationsController(app, { onChange: (view) => views.push(view), selection });
  const view = controller.getView();
  assert.equal(view.counts.critique, 3);
  const linkFinding = view.items.find((item) => item.target.kind === 'link');
  const deviceFinding = view.items.find((item) => item.target.kind === 'device');
  assert.equal(controller.choose(linkFinding.id), true);
  assert.equal(controller.choose(deviceFinding.id), true);
  assert.deepEqual(calls, ['sélection vide', `lien ${linkFinding.target.id}`, 'lien null', `sélection ${deviceFinding.target.id}`, `focus ${deviceFinding.target.id}`]);
  assert.equal(views.at(-1).items.find((item) => item.selected).id, deviceFinding.id);
  assert.equal(controller.choose('inconnu'), false);
  controller.dispose();
});

test('mise à jour : lien saturé détecté pendant la lecture, puis effacé à la réinitialisation', async () => {
  const sim = await simFor('debit');
  const controller = createRecommendationsController({ sim });
  assert.ok(!controller.getView().items.some((item) => item.rule === 'saturated'));
  while (sim.getState().time < 6000) sim.step();
  controller.refresh();
  assert.ok(controller.getView().items.some((item) => item.rule === 'saturated' && item.severity === 'critique'));
  sim.reset();
  assert.ok(!controller.getView().items.some((item) => item.rule === 'saturated'), 'réinitialisation : diagnostic refait sans trafic');
  controller.dispose();
});

test('mount sous Node : gabarit fixe, aucune donnée de scénario dans le HTML', async () => {
  const sim = await simFor('diagnostic');
  const container = { innerHTML: '' };
  const badge = { textContent: '', hidden: true, setAttribute() {} };
  const panel = mount(container, { sim }, { badge });
  assert.doesNotMatch(container.innerHTML, /Passerelle/);
  assert.equal(badge.textContent, '6');
  assert.equal(badge.hidden, false);
  panel.dispose();
});

test('onglets : flèches, Début et Fin', () => {
  assert.equal(nextTabIndex('ArrowRight', 0, 2), 1);
  assert.equal(nextTabIndex('ArrowRight', 1, 2), 0);
  assert.equal(nextTabIndex('ArrowLeft', 0, 2), 1);
  assert.equal(nextTabIndex('Home', 1, 2), 0);
  assert.equal(nextTabIndex('End', 0, 2), 1);
  assert.equal(nextTabIndex('Enter', 0, 2), null);
});
