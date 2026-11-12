// Pôle sim : point d'entrée appelé par main.js.
//
// init(app) renvoie l'API de la simulation, rangée dans app.sim (voir commands.js), plus le choix
// du scénario : listScenarios() et loadScenario(id).
// Les pôles render, ui et xr sont initialisés APRÈS : ils trouvent un scénario déjà chargé
// (app.sim.getScenario()) et s'abonnent au bus pour la suite (app.sim.on(TOPICS.X, ...)).
//
// Depuis la phase 4 : vrai moteur (createSimulation), comportements d'équipements
// (devices/*.js), protocoles de src/sim/protocols/ et scénarios de scenarios/index.json.
// Si aucun scénario ne peut être lu (fichiers absents, hors ligne sans cache), on se rabat sur
// le faux moteur et sa démonstration : l'application reste utilisable.

import { createSimulation } from './commands.js';
import { DEVICE_BEHAVIOURS } from './devices/index.js';
import { createScenarioLibrary, summarize } from './library.js';
import { createMockSimulation, DEMO_SCENARIO } from './mock.js';

/**
 * @param {object} [app] objet partagé rempli par main.js
 * @param {{ library?: { loadAll(): Promise<{ scenarios: object[], errors: string[] }> }, options?: object }} [settings]
 *   pour les tests : bibliothèque et options du moteur (scheduler…)
 */
export async function init(app = {}, { library = createScenarioLibrary(), options = {} } = {}) {
  const { scenarios, errors } = await library.loadAll();
  for (const message of errors) console.error('Scénario écarté :', message);

  if (scenarios.length === 0) {
    const mock = createMockSimulation(options);
    await mock.load(DEMO_SCENARIO);
    return Object.freeze({
      ...mock,
      listScenarios: () => [summarize(DEMO_SCENARIO)],
      loadScenario: async (id) => (id === DEMO_SCENARIO.id ? mock.load(DEMO_SCENARIO) : false),
    });
  }

  const sim = createSimulation({ ...options, devices: DEVICE_BEHAVIOURS });
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  await sim.load(scenarios[0]);

  return Object.freeze({
    ...sim,
    /** Scénarios proposés, dans l'ordre de scenarios/index.json : [{ id, title, protocol, description }]. */
    listScenarios: () => scenarios.map(summarize),
    /**
     * Charge un scénario de la liste (état « prêt », temps à 0).
     * @param {string} id
     * @param {Record<string, any>} [params] remplace une partie de scenario.params
     * @returns {Promise<boolean>} false si l'id est inconnu
     */
    async loadScenario(id, params = {}) {
      const scenario = byId.get(id);
      if (!scenario) return false;
      return sim.load(scenario, params);
    },
  });
}
