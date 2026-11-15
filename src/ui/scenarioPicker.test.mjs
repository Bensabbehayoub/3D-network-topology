// Tests du choix du scénario (phase 4). Sans DOM : vue pure et contrôleur, avec un vrai moteur.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSimulation, DEMO_PROTOCOL, DEMO_SCENARIO } from '../../simulation.js';
import { canPick, createPickerController, EMPTY_LABEL, mount, pickerView } from './scenarioPicker.js';

const noClock = { start: () => () => {} };
const scenarioB = { ...structuredClone(DEMO_SCENARIO), id: 'b', title: 'Scénario <b>B</b>', description: 'Deuxième' };

/** Moteur réel avec un protocole de démonstration, et la même API de choix que src/sim/index.js. */
async function simWithChoice({ failOn = null } = {}) {
  const sim = createSimulation({ protocol: DEMO_PROTOCOL, scheduler: noClock });
  const scenarios = [DEMO_SCENARIO, scenarioB];
  await sim.load(DEMO_SCENARIO);
  return {
    ...sim,
    listScenarios: () => scenarios.map(({ id, title, protocol, description }) => ({ id, title, protocol, description: description ?? '' })),
    async loadScenario(id) {
      if (id === failOn) throw new Error('fichier illisible');
      const found = scenarios.find((s) => s.id === id);
      return found ? sim.load(found) : false;
    },
  };
}

test('vue : liste du moteur, scénario chargé sélectionné, description', async () => {
  const sim = await simWithChoice();
  const view = pickerView(sim);
  assert.deepEqual(view.options, [{ id: 'demo', title: DEMO_SCENARIO.title }, { id: 'b', title: 'Scénario <b>B</b>' }]);
  assert.equal(view.selected, 'demo');
  assert.equal(view.description, DEMO_SCENARIO.description);
  assert.equal(view.enabled, true);
});

test('vue : moteur absent ou sans choix possible → liste désactivée', () => {
  assert.equal(canPick({}), false);
  assert.deepEqual(pickerView(undefined), { enabled: false, options: [], selected: null, description: '', loading: false, error: null });
  assert.equal(pickerView({ listScenarios: () => [] , loadScenario() {} }).enabled, false);
});

test('choisir charge le scénario ; la vue suit aussi les chargements faits ailleurs', async () => {
  const sim = await simWithChoice();
  const views = [];
  const picker = createPickerController({ sim }, { onChange: (view) => views.push(view) });
  assert.equal(await picker.choose('b'), true);
  assert.equal(sim.getScenario().id, 'b');
  assert.equal(views[0].loading, true, 'liste désactivée pendant le chargement');
  assert.equal(views[0].enabled, false);
  assert.equal(views.at(-1).selected, 'b');
  assert.equal(views.at(-1).loading, false);
  await sim.loadScenario('demo'); // ex. depuis un autre module
  assert.equal(views.at(-1).selected, 'demo');
  assert.equal(await picker.choose('demo'), true, 'déjà chargé : rien à faire');
  picker.dispose();
});

test('erreurs : id inconnu ou chargement en échec → message, scénario courant gardé', async () => {
  const sim = await simWithChoice({ failOn: 'b' });
  const picker = createPickerController({ sim });
  assert.equal(await picker.choose('zzz'), false);
  assert.equal(picker.getView().error, 'Scénario inconnu.');
  assert.equal(await picker.choose('b'), false);
  assert.match(picker.getView().error, /fichier illisible/);
  assert.equal(sim.getScenario().id, 'demo');
});

test('mount sous Node : gabarit fixe sans donnée de scénario dans le HTML', async () => {
  const container = { innerHTML: '' };
  const api = mount(container, { sim: await simWithChoice() });
  assert.match(container.innerHTML, /<select data-role="scenario"/);
  assert.doesNotMatch(container.innerHTML, /Scénario <b>B<\/b>/, 'les titres sont écrits avec textContent, jamais dans le HTML');
  assert.equal(api.getView().options.length, 2);
  assert.equal(typeof EMPTY_LABEL, 'string');
  api.dispose();
});
