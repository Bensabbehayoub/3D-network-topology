// Pôle sim (Khalil) : point d'entrée appelé par main.js.
//
// init(app) renvoie l'API de la simulation, rangée dans app.sim (voir commands.js).
// Les pôles render, ui et xr sont initialisés APRÈS : ils trouvent un scénario déjà chargé
// (app.sim.getScenario()) et s'abonnent au bus pour la suite (app.sim.on(TOPICS.X, ...)).
//
// S1 : faux moteur (mock.js) avec la topologie de démonstration.
// S2-S3 : remplacé par createSimulation() et les vrais protocoles, même API.

import { createMockSimulation, DEMO_SCENARIO } from './mock.js';

/**
 * @param {object} [app] objet partagé rempli par main.js
 * @param {{ scenario?: object, options?: object }} [settings] pour les tests uniquement
 */
export async function init(app = {}, { scenario = DEMO_SCENARIO, options = {} } = {}) {
  const sim = createMockSimulation(options);
  await sim.load(scenario);
  return sim;
}
