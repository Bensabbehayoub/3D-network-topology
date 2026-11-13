// Aide des tests réseau (phase 4) : joue un scénario avec le vrai moteur, les vrais équipements
// et le vrai protocole, jusqu'à la fin, et rend ce qui s'est passé. Pas un fichier de test.
import { readFile } from 'node:fs/promises';

import { createSimulation, TOPICS } from '../simulation.js';
import { DEVICE_BEHAVIOURS } from '../src/sim/devices/index.js';
import { transmissionModel } from '../src/sim/traffic.js';

export const noClock = { start: () => () => {} };

export async function readScenario(id) {
  return JSON.parse(await readFile(new URL(`../scenarios/${id}.json`, import.meta.url), 'utf8'));
}

/**
 * @param {object} scenario
 * @param {Record<string, any>} [params]
 * @param {(sim: object) => void} [setup] appelé avant le chargement
 * @returns {Promise<{ sim: object, events: object[], steps: string[], sends: string[], drops: object[], state: object }>}
 *   sends : « protocole/type source→destination » pour chaque envoi, dans l'ordre
 */
export async function play(scenario, params = {}, setup = () => {}) {
  const sim = createSimulation({ devices: DEVICE_BEHAVIOURS, transmission: transmissionModel, scheduler: noClock });
  const events = [];
  const steps = [];
  sim.on(TOPICS.NETWORK, (event) => events.push(event));
  sim.on(TOPICS.STEP, ({ step }) => steps.push(step));
  setup(sim); // ex. brancher un compteur de trafic avant la lecture
  await sim.load(scenario, params);
  let guard = 0;
  while (sim.getState().status !== 'finished' && guard++ < 10_000) sim.step();
  const sends = events.filter((e) => e.type === 'send').map((e) => `${e.packet.protocol}/${e.packet.type} ${e.source}→${e.destination}`);
  const drops = events.filter((e) => e.type === 'drop');
  return { sim, events, steps, sends, drops, state: sim.getState() };
}

/** Variante d'un scénario : copie profonde puis modification. */
export function variant(scenario, change) {
  const copy = structuredClone(scenario);
  change(copy);
  return copy;
}
