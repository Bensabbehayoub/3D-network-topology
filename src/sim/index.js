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
import { TOPICS } from './events.js';
import { createTrafficMeter, SLOWDOWN, transmissionModel } from './traffic.js';
import { diagnose } from './diagnostics.js';

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
      diagnose: () => diagnose(mock.getScenario()),
      loadScenario: async (id) => (id === DEMO_SCENARIO.id ? mock.load(DEMO_SCENARIO) : false),
    });
  }

  // Phase 5 : chaque trame a une taille et un temps d'émission (bande passante), et le trafic est mesuré.
  const sim = createSimulation({ ...options, devices: DEVICE_BEHAVIOURS, transmission: transmissionModel });
  const meter = createTrafficMeter();
  sim.on(TOPICS.NETWORK, (event) => meter.add(event));
  sim.on(TOPICS.RESET, () => meter.reset());
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
    /**
     * Trafic mesuré à l'instant courant (phase 5) : débits instantané et moyen, utilisation, par
     * lien (sens a→b et b→a), par port et par équipement. Débits en Mb/s de temps réseau
     * (1 s de simulation = 1 ms de réseau, voir traffic.js).
     */
    getTraffic: () => meter.snapshot(sim.getScenario(), sim.getState().time),
    /** Facteur de ralenti : 1 ms de simulation = 1/SLOWDOWN ms de réseau. */
    timeScale: SLOWDOWN,
    /**
     * Diagnostic de la topologie chargée (phase 6) : configuration et trafic mesuré à l'instant
     * courant. Liste triée par gravité (voir src/sim/diagnostics.js).
     */
    diagnose: () => diagnose(sim.getScenario(), { traffic: meter.snapshot(sim.getScenario(), sim.getState().time) }),
  });
}
